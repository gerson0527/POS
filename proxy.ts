import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Permitir archivos estáticos y rutas públicas de auth
  const isPublicPath = PUBLIC_PATHS.some(path => pathname.startsWith(path))
  if (isPublicPath) {
    return addSecurityHeaders(NextResponse.next())
  }

  // 2. Verificar si la ruta actual es una ruta protegida
  const isProtectedPath = PROTECTED_PREFIXES.some(prefix => pathname.startsWith(prefix))

  if (isProtectedPath) {
    // Extraer token de sesión de Better Auth o cookies/headers JWT
    const sessionToken = 
      request.cookies.get('better-auth.session_token')?.value ||
      request.cookies.get('__Secure-better-auth.session_token')?.value ||
      request.headers.get('authorization')?.replace('Bearer ', '')

    // Si no hay sesión y es una petición de API -> HTTP 401 Unauthorized
    if (!sessionToken && pathname.startsWith('/api/')) {
      return new NextResponse(
        JSON.stringify({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Acceso denegado: Token de autenticación requerido',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Si no hay sesión y es una ruta de interfaz (dashboard/pos) -> Redirigir a /login
    if (!sessionToken && (pathname.startsWith('/dashboard') || pathname.startsWith('/pos'))) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Validar encabezado X-Tenant-ID obligatorio para peticiones de API multi-tenant
    if (pathname.startsWith('/api/v1')) {
      const tenantId = request.headers.get('x-tenant-id') || request.cookies.get('tenant_id')?.value
      if (!tenantId) {
        return new NextResponse(
          JSON.stringify({
            success: false,
            error: {
              code: 'TENANT_HEADER_MISSING',
              message: 'Acceso denegado: Se requiere el encabezado X-Tenant-ID o cookie tenant_id',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        )
      }
    }
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
