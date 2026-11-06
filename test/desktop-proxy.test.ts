import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }))

import { proxy } from '@/proxy'

const origins = ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']

function request(path: string, origin: string, method = 'GET', headers = {}) {
  return new NextRequest(`http://localhost:3000${path}`, {
    method,
    headers: { origin, ...headers },
  })
}

afterEach(() => vi.unstubAllEnvs())

describe('desktop bootstrap CORS', () => {
  it.each(origins)('allows only bootstrap requests from %s', async origin => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', 'desktop.env')
    for (const [path, method] of [
      ['/api/health', 'GET'],
      ['/api/setup', 'GET'],
      ['/api/setup', 'POST'],
    ]) {
      const response = await proxy(request(path, origin, method))
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
      expect(response.headers.get('Vary')).toBe('Origin')
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(response.headers.has('Access-Control-Allow-Credentials')).toBe(false)
    }
  })

  it.each(origins)('handles setup JSON preflight from %s', async origin => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', 'desktop.env')
    const response = await proxy(request('/api/setup', origin, 'OPTIONS', {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    }))
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type')
  })

  it('limits health preflight to GET without custom headers', async () => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', 'desktop.env')
    const response = await proxy(request('/api/health', origins[0], 'OPTIONS'))
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS')
    expect(response.headers.has('Access-Control-Allow-Headers')).toBe(false)
  })

  it.each([undefined, ''])('does not enable CORS without a desktop env file (%s)', async env => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', env)
    for (const method of ['GET', 'POST', 'OPTIONS']) {
      const response = await proxy(request('/api/setup', origins[1], method))
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
      expect(response.headers.has('Access-Control-Allow-Methods')).toBe(false)
      expect(response.headers.has('Access-Control-Allow-Headers')).toBe(false)
    }
  })

  it.each(['https://example.com', 'null', 'http://tauri.localhost.evil', 'http://localhost:3000'])('does not allow origin %s', async origin => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', 'desktop.env')
    for (const method of ['POST', 'OPTIONS']) {
      const response = await proxy(request('/api/setup', origin, method))
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
      expect(response.headers.has('Access-Control-Allow-Methods')).toBe(false)
      expect(response.headers.has('Access-Control-Allow-Headers')).toBe(false)
    }
  })

  it.each(['/api/setup/extra', '/api/healthcheck', '/api/auth', '/api/reports'])('does not extend CORS to %s', async path => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', 'desktop.env')
    const response = await proxy(request(path, origins[1], 'OPTIONS'))
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
    expect(response.headers.has('Access-Control-Allow-Methods')).toBe(false)
    if (path === '/api/reports') expect(response.status).toBe(401)
  })

  it.each([['/api/health', 'POST'], ['/api/setup', 'DELETE']])('does not allow %s %s', async (path, method) => {
    vi.stubEnv('POS_DESKTOP_ENV_FILE', 'desktop.env')
    const response = await proxy(request(path, origins[1], method))
    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false)
  })
})
