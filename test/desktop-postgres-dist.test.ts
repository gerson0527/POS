import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { deflateRawSync } from 'node:zlib'

const require = createRequire(import.meta.url)
const {
  DISTRIBUTION, REQUIRED_TOOLS, REQUIRED_CRT_DLLS, approvedUrl, verifyArchive, readZip,
  stageArchive, copyVisualCppRuntime, preparePostgres, parseArgs,
} = require('../scripts/prepare-postgres-dist.js')

const temporary: string[] = []
function temp() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pos-postgres-test-'))
  temporary.push(directory)
  return directory
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of temporary.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

type Entry = { name: string; text?: string; mode?: number; deflate?: boolean; localName?: string }

// Minimal ZIP32 fixtures, never downloaded or executed. Production SHA verification
// is tested separately; packing tests intentionally exercise only the internal primitive.
function zip(entries: Entry[]) {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const localName = Buffer.from(entry.localName ?? entry.name)
    const content = Buffer.from(entry.text ?? (entry.name.endsWith('/') ? '' : 'fixture'))
    const packed = entry.deflate ? deflateRawSync(content) : content
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(entry.deflate ? 8 : 0, 8)
    header.writeUInt32LE(packed.length, 18)
    header.writeUInt32LE(content.length, 22)
    header.writeUInt16LE(localName.length, 26)
    local.push(header, localName, packed)
    const record = Buffer.alloc(46)
    record.writeUInt32LE(0x02014b50)
    record.writeUInt16LE(0x0314, 4)
    record.writeUInt16LE(20, 6)
    record.writeUInt16LE(entry.deflate ? 8 : 0, 10)
    record.writeUInt32LE(packed.length, 20)
    record.writeUInt32LE(content.length, 24)
    record.writeUInt16LE(name.length, 28)
    record.writeUInt32LE(((entry.mode ?? (entry.name.endsWith('/') ? 0o40755 : 0o100644)) << 16) >>> 0, 38)
    record.writeUInt32LE(offset, 42)
    central.push(record, name)
    offset += header.length + localName.length + packed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}

function layout(): Entry[] {
  return [
    ...REQUIRED_TOOLS.map((tool: string) => ({ name: `pgsql/bin/${tool}`, deflate: true })),
    { name: 'pgsql/bin/libpq.dll', text: 'keep DLL dependency' },
    { name: 'pgsql/bin/libssl-3-x64.dll' },
    { name: 'pgsql/lib/plpgsql.dll' },
    { name: 'pgsql/share/postgres.bki', text: 'catalog bootstrap' },
    { name: 'pgsql/share/postgresql.conf.sample' },
    { name: 'pgsql/share/extension/pgcrypto.control' },
    { name: 'pgsql/server_license.txt', text: 'PostgreSQL notice' },
    { name: 'pgsql/commandlinetools_3rd_party_licenses.txt', text: 'Third-party LGPL notice' },
    { name: 'pgsql/pgAdmin 4/private.txt', text: 'excluded component' },
    { name: 'pgsql/data/PG_VERSION', text: 'excluded database cluster' },
    { name: 'pgsql/.env', text: 'excluded secret' },
    { name: 'pgsql/installation_notes.html', text: 'excluded installer' },
  ]
}

describe('pinned official PostgreSQL distribution', () => {
  it('pins the exact official ZIP and provider-published SHA-256, without overrides', () => {
    expect(DISTRIBUTION.version).toBe('17.11')
    expect(DISTRIBUTION.url).toBe('https://get.enterprisedb.com/postgresql/postgresql-17.11-5-windows-x64-binaries.zip')
    expect(DISTRIBUTION.checksumSource).toBe(`${DISTRIBUTION.url}.sha256`)
    expect(DISTRIBUTION.sha256).toBe('80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f')
    expect(Object.isFrozen(DISTRIBUTION)).toBe(true)
    expect(parseArgs(['--archive', 'offline archive.zip'])).toEqual({ archive: 'offline archive.zip' })
    expect(parseArgs([])).toEqual({})
    for (const args of [['--sha256', 'abc'], ['--archive'], ['--archive', '--help'], ['--url', 'https://example.com']]) {
      expect(() => parseArgs(args)).toThrow(/Usage/)
    }
  })

  it.each([
    'http://get.enterprisedb.com/postgresql/archive.zip',
    'https://get.enterprisedb.com.evil.test/archive.zip',
    'https://example.com/archive.zip',
    'https://get.enterprisedb.com:444/archive.zip',
    'https://user:password@get.enterprisedb.com/archive.zip',
    'file:///tmp/archive.zip',
  ])('rejects unapproved initial/redirect URL %s', url => {
    expect(() => approvedUrl(url)).toThrow(/Unapproved/)
  })

  it('allows only the explicitly approved HTTPS host', () => {
    expect(approvedUrl(DISTRIBUTION.url).hostname).toBe('get.enterprisedb.com')
  })

  it('rejects altered offline bytes before touching the existing distribution or using network', async () => {
    const root = temp()
    fs.mkdirSync(path.join(root, 'src-tauri/postgres-bundle'), { recursive: true })
    const previous = path.join(root, 'src-tauri/postgres-bundle/previous.txt')
    fs.writeFileSync(previous, 'keep previous distribution')
    const archive = path.join(root, 'offline.zip')
    fs.writeFileSync(archive, zip(layout()))
    expect(() => verifyArchive(archive)).toThrow(/SHA-256 mismatch/)
    await expect(preparePostgres(root, { archive })).rejects.toThrow(/SHA-256 mismatch/)
    expect(fs.readFileSync(previous, 'utf8')).toBe('keep previous distribution')
    expect(fs.existsSync(path.join(root, '.cache'))).toBe(false)
    expect(fs.readdirSync(path.join(root, 'src-tauri'))).toEqual(['postgres-bundle'])
  })

  it('revalidates cached archives, rather than trusting their filename', async () => {
    const root = temp()
    fs.mkdirSync(path.join(root, 'src-tauri'))
    fs.mkdirSync(path.join(root, '.cache/postgres'), { recursive: true })
    fs.writeFileSync(path.join(root, '.cache/postgres', DISTRIBUTION.archive), 'corrupted cache')
    await expect(preparePostgres(root)).rejects.toThrow(/SHA-256 mismatch/)
    expect(fs.existsSync(path.join(root, 'src-tauri/postgres-bundle'))).toBe(false)
  })
})

describe('PostgreSQL resource packing', () => {
  it('packs bin/lib/share and original licenses without data, secrets or pgAdmin', () => {
    const staging = temp()
    stageArchive(zip(layout()), staging)
    const runtime = temp()
    for (const dll of REQUIRED_CRT_DLLS) fs.writeFileSync(path.join(runtime, dll), `runtime ${dll}`)
    copyVisualCppRuntime(staging, runtime)
    expect(fs.readdirSync(staging).sort()).toEqual(['bin', 'distribution.json', 'lib', 'licenses', 'share'])
    for (const tool of REQUIRED_TOOLS) expect(fs.readFileSync(path.join(staging, 'bin', tool), 'utf8')).toBe('fixture')
    for (const dll of REQUIRED_CRT_DLLS) {
      expect(fs.readFileSync(path.join(staging, 'bin', dll), 'utf8')).toBe(`runtime ${dll}`)
    }
    expect(fs.readFileSync(path.join(staging, 'bin/libpq.dll'), 'utf8')).toBe('keep DLL dependency')
    expect(fs.readFileSync(path.join(staging, 'licenses/server_license.txt'), 'utf8')).toBe('PostgreSQL notice')
    expect(fs.readFileSync(path.join(staging, 'licenses/commandlinetools_3rd_party_licenses.txt'), 'utf8')).toBe('Third-party LGPL notice')
    expect(fs.existsSync(path.join(staging, 'share/extension/pgcrypto.control'))).toBe(true)
    const manifest = JSON.parse(fs.readFileSync(path.join(staging, 'distribution.json'), 'utf8'))
    expect(manifest.sha256).toBe(DISTRIBUTION.sha256)
    expect(manifest.prerequisites.visualCpp).toContain('app-local')
    expect(manifest.prerequisites.visualCppDlls).toEqual(REQUIRED_CRT_DLLS)
    expect(manifest.licensing.review).toContain('LGPL')
  })

  it.each(REQUIRED_TOOLS as readonly string[])('fails when the required tool %s is missing', tool => {
    expect(() => stageArchive(zip(layout().filter(entry => entry.name !== `pgsql/bin/${tool}`)), temp())).toThrow()
  })

  it.each(['server_license.txt', 'commandlinetools_3rd_party_licenses.txt', 'share/postgres.bki', 'lib/plpgsql.dll', 'bin/libpq.dll'])(
    'fails when required runtime/license content %s is missing', file => {
      expect(() => stageArchive(zip(layout().filter(entry => entry.name !== `pgsql/${file}`)), temp())).toThrow()
    },
  )

  it.each(['pgsql/bin/.env.local', 'pgsql/share/data/PG_VERSION', 'pgsql/bin/server.key', 'pgsql/lib/pgpass.conf'])(
    'rejects data/secrets inside selected resources: %s', name => {
      const staging = temp()
      expect(() => stageArchive(zip([...layout(), { name }]), staging)).toThrow(/Data\/secrets/)
      expect(fs.readdirSync(staging)).toEqual([])
    },
  )
})

describe('ZIP extraction safety (including excluded components)', () => {
  it.each([
    'pgsql/../escape.exe', '../escape.exe', '/pgsql/bin/tool.exe', 'C:/pgsql/tool.exe',
    'pgsql/bin/../../escape.exe', 'pgsql\\bin\\tool.exe', 'pgsql/bin/file:secret',
    'pgsql/bin/CON.exe', 'pgsql/bin/tool.exe.', 'pgsql/bin/tool.exe ', 'pgsql//tool.exe',
    'pgsql/pgAdmin 4/../../../escape.exe', 'pgsql/bin/bad\0name', 'other/bin/postgres.exe',
  ])('rejects unsafe path %j before writing anything', name => {
    const staging = temp()
    expect(() => stageArchive(zip([...layout(), { name }]), staging)).toThrow(/Unsafe ZIP path|Unexpected ZIP root/)
    expect(fs.readdirSync(staging)).toEqual([])
  })

  it.each([0o120777, 0o020600, 0o010600])('rejects symlink/device/FIFO mode %i', mode => {
    expect(() => readZip(zip([{ name: 'pgsql/pgAdmin 4/link', mode }]))).toThrow(/symlink\/reparse\/special/)
  })

  it('rejects Windows case aliases, duplicate files, and parent files used as directories', () => {
    for (const names of [
      ['pgsql/bin/tool.exe', 'pgsql/bin/TOOL.exe'],
      ['pgsql/bin/tool.exe', 'pgsql/bin/tool.exe'],
      ['pgsql/bin', 'pgsql/bin/tool.exe'],
    ]) {
      expect(() => readZip(zip(names.map(name => ({ name }))))).toThrow(/Duplicate|collision/)
    }
  })

  it('rejects inconsistent local headers and malformed/truncated archives', () => {
    expect(() => readZip(zip([{ name: 'pgsql/bin/tool.exe', localName: '../escape.exe' }]))).toThrow(/header mismatch/)
    expect(() => readZip(Buffer.from('not a zip'))).toThrow(/Invalid ZIP/)
    expect(() => readZip(zip(layout()).subarray(0, -1))).toThrow(/end record/)
  })

  it('rejects encrypted and ZIP64 archives and bounds claimed expanded sizes', () => {
    const encrypted = zip([{ name: 'pgsql/bin/tool.exe' }])
    const central = encrypted.readUInt32LE(encrypted.length - 6)
    encrypted.writeUInt16LE(1, central + 8)
    expect(() => readZip(encrypted)).toThrow(/Unsupported/)
    const zip64 = zip([])
    zip64.writeUInt16LE(0xffff, 10)
    expect(() => readZip(zip64)).toThrow(/ZIP64/)
    const oversized = zip([{ name: 'pgsql/bin/tool.exe' }])
    oversized.writeUInt32LE(0x7fffffff, oversized.readUInt32LE(oversized.length - 6) + 24)
    expect(() => readZip(oversized)).toThrow(/oversized/)
  })

  it('refuses nonempty staging instead of following existing children or merging stale data', () => {
    const staging = temp()
    fs.writeFileSync(path.join(staging, 'stale.txt'), 'preserve')
    expect(() => stageArchive(zip(layout()), staging)).toThrow(/empty directory/)
    expect(fs.readFileSync(path.join(staging, 'stale.txt'), 'utf8')).toBe('preserve')
  })

  it('rejects a symlink/junction staging directory', () => {
    const parent = temp()
    const outside = temp()
    const staging = path.join(parent, 'staging')
    fs.symlinkSync(outside, staging, process.platform === 'win32' ? 'junction' : 'dir')
    expect(() => stageArchive(zip(layout()), staging)).toThrow(/Symlink\/junction/)
    expect(fs.readdirSync(outside)).toEqual([])
  })

  it('does not follow a symlink/junction destination', async () => {
    const root = temp()
    const outside = temp()
    fs.mkdirSync(path.join(root, 'src-tauri'))
    fs.symlinkSync(outside, path.join(root, 'src-tauri/postgres-bundle'), process.platform === 'win32' ? 'junction' : 'dir')
    await expect(preparePostgres(root, { archive: 'not-read.zip' })).rejects.toThrow(/Symlink\/junction/)
    expect(fs.readdirSync(outside)).toEqual([])
  })
})
