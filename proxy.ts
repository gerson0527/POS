import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

// Rutas públicas que no requieren autenticación
const PUBLIC_PATHS = [
  '/api/auth',
  '/_next',
  '/favicon.ico',
  '/login',
]

// Rutas protegidas que requieren sesión y tenantId
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/pos',
  '/api/v1',
  '/api/reports',
]

function unauthorizedResponse() {
  return new NextResponse(
    JSON.stringify({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Acceso denegado: autenticación requerida',
      },
    }),
    {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    }
  )
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path))
  if (isPublicPath) {
    return addSecurityHeaders(NextResponse.next())
  }

  const isProtectedPath = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix))
  if (!isProtectedPath) {
    return addSecurityHeaders(NextResponse.next())
  }

  const authorization = request.headers.get('authorization') || ''
  const bearerToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

  // La API pública se autentica con API key (prefijo.secreto). La validación
  // real de hash, estado, expiración y rate limit se hace en el route handler.
  if (pathname.startsWith('/api/v1') && bearerToken.includes('.')) {
    return addSecurityHeaders(NextResponse.next())
  }

  const hasSessionCookie =
    Boolean(request.cookies.get('better-auth.session_token')?.value) ||
    Boolean(request.cookies.get('__Secure-better-auth.session_token')?.value)

  if (!hasSessionCookie) {
    if (pathname.startsWith('/dashboard') || pathname.startsWith('/pos')) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return addSecurityHeaders(NextResponse.redirect(loginUrl))
    }
    return addSecurityHeaders(unauthorizedResponse())
  }

  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) {
      if (pathname.startsWith('/dashboard') || pathname.startsWith('/pos')) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return addSecurityHeaders(NextResponse.redirect(loginUrl))
      }
      return addSecurityHeaders(unauthorizedResponse())
    }
  } catch {
    return addSecurityHeaders(unauthorizedResponse())
  }

  return addSecurityHeaders(NextResponse.next())
}

/**
 * Inyecta encabezados de seguridad de nivel Enterprise (OWASP)
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  return response
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas excepto archivos estáticos (css, js, imágenes)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
