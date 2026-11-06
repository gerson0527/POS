import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dotenv from 'dotenv'

const pgCalls = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  poolQuery: vi.fn(async () => ({ rows: [{ has_admin: false }] })),
}))

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => { throw new Error('PostgreSQL unavailable in unit test') }),
}))
vi.mock('pg', () => ({
  Client: class {
    async connect() { pgCalls.connect() }
    async query(...args: unknown[]) {
      pgCalls.query(...args)
      return { rows: [{ exists: 1 }] }
    }
    async end() {}
  },
  Pool: class {
    async query() { return pgCalls.poolQuery() }
    async end() {}
  },
}))
vi.mock('@/lib/db/migrate', () => ({ runMigrations: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/scripts/seed', () => ({ runSeed: vi.fn().mockResolvedValue(undefined) }))

import { GET, POST } from '@/app/api/setup/route'

let directory: string
let cwdEnv: string
let desktopEnv: string

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-setup-env-'))
  cwdEnv = path.join(directory, '.env')
  desktopEnv = path.join(directory, 'desktop.env')
  vi.spyOn(process, 'cwd').mockReturnValue(directory)
  vi.stubEnv('POS_DESKTOP_ENV_FILE', desktopEnv)
  vi.stubEnv('DATABASE_URL', '')
  pgCalls.connect.mockClear()
  pgCalls.query.mockClear()
  pgCalls.poolQuery.mockReset().mockResolvedValue({ rows: [{ has_admin: false }] })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(directory, { recursive: true, force: true })
})

async function configure(body: Record<string, string>) {
  return POST(new NextRequest('http://localhost:3000/api/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

describe('setup env file', () => {
  it('checks hasEnv at the desktop path, not cwd/.env', async () => {
    fs.writeFileSync(cwdEnv, 'CWD_ONLY=true\n')
    expect((await (await GET()).json()).hasEnv).toBe(false)
    fs.writeFileSync(desktopEnv, '')
    expect((await (await GET()).json()).hasEnv).toBe(true)
  })

  it('requires first-run setup when the private database has no initialized user table', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/private-pos')
    const status = await (await GET()).json()
    expect(status).toMatchObject({ dbConnected: true, setupRequired: true })
  })

  it.each([undefined, ''])('falls back to cwd/.env when desktop path is %s', async desktopPath => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', desktopPath)
    expect((await (await GET()).json()).hasEnv).toBe(false)
    fs.writeFileSync(cwdEnv, "EXISTING='keep#this'\n")
    expect((await (await GET()).json()).hasEnv).toBe(true)
    const response = await configure({ mode: 'cloud', cloudUrl: 'postgresql://localhost/pos' })
    expect(response.status).toBe(200)
    const parsed = dotenv.parse(fs.readFileSync(cwdEnv))
    expect(parsed.EXISTING).toBe('keep#this')
    expect(parsed.DATABASE_URL).toBe('postgresql://localhost/pos')
    expect(fs.existsSync(desktopEnv)).toBe(false)
  })

  it('keeps desktop setup on its private database when another URL is submitted', async () => {
    const privateUrl = 'postgresql://pos_retail_app:private@127.0.0.1:55432/pos_retail_enterprise'
    const existing = {
      EXISTING: '  spaces # hash = equals  ',
      POSTGRES_PASSWORD: 'previous#password',
      BETTER_AUTH_SECRET: 'existing#auth-secret',
      ENCRYPTION_KEY: 'existing#encryption-key',
    }
    fs.writeFileSync(desktopEnv, [
      ...Object.entries(existing).map(([key, value]) => `${key}='${value}'`),
      `DATABASE_URL='${privateUrl}'`,
    ].join('\n'))
    vi.stubEnv('DATABASE_URL', privateUrl)
    fs.writeFileSync(cwdEnv, 'CWD_ONLY=untouched\n')
    const cloudUrl = 'postgresql://user:password@localhost/pos?application_name=setup#fragment'
    const response = await configure({
      mode: 'cloud',
      cloudUrl,
      companyName: 'Empresa de prueba S.A.S.',
      companyNit: '901234567-8',
      adminName: 'Administrador',
      adminEmail: 'admin@example.com',
      adminPassword: 'a-secure-password-123',
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    const contents = fs.readFileSync(desktopEnv, 'utf8')
    expect(dotenv.parse(contents)).toMatchObject({ ...existing, DATABASE_URL: privateUrl })
    expect(contents).toContain(`DATABASE_URL='${privateUrl}'`)
    expect(fs.readFileSync(cwdEnv, 'utf8')).toBe('CWD_ONLY=untouched\n')
    expect(pgCalls.connect).not.toHaveBeenCalled()
    expect(pgCalls.query).not.toHaveBeenCalled()
  })

  it('rejects weak or incomplete credentials during desktop first-run setup', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/private-pos')
    const response = await configure({
      companyName: 'Empresa',
      companyNit: '901234567-8',
      adminName: 'Admin',
      adminEmail: 'admin@example.com',
      adminPassword: 'short',
    })
    expect(response.status).toBe(400)
    expect(pgCalls.poolQuery).not.toHaveBeenCalled()
  })

  it('does not reseed a desktop database that already has a user', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/private-pos')
    pgCalls.poolQuery.mockResolvedValue({ rows: [{ has_admin: true }] })
    const response = await configure({
      companyName: 'Empresa',
      companyNit: '901234567-8',
      adminName: 'Admin',
      adminEmail: 'admin@example.com',
      adminPassword: 'a-secure-password-123',
    })
    expect(response.status).toBe(409)
  })

  it.each([
    ' # pa$$word = spaces ',
    "pass'word#hash",
    'pass"word#hash',
    'both\'"quotes#hash\\n\\r',
    '`backticks`#hash',
  ])('round-trips a local password with special characters (%s)', async dbPassword => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', '')
    const response = await configure({ mode: 'local', dbPassword })
    expect(response.status).toBe(200)
    const parsed = dotenv.parse(fs.readFileSync(cwdEnv))
    expect(parsed.POSTGRES_PASSWORD).toBe(dbPassword)
    expect(parsed.DATABASE_URL).toBe(`postgresql://postgres:${encodeURIComponent(dbPassword)}@localhost:5432/pos_retail_enterprise`)
    expect(fs.existsSync(desktopEnv)).toBe(false)
  })
})
