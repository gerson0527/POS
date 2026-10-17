/** @type {import('next').NextConfig} */
// Seguridad (H-5): CSP y Permissions-Policy globales. Las demás cabeceras
// (nosniff, X-Frame-Options, Referrer-Policy, HSTS) las añade proxy.ts.
const securityHeaders = [
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self'",
      "worker-src 'self' blob:",
    ].join('; '),
  },
]

const nextConfig = {
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['nodemailer', 'puppeteer'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ]
  },
}

export default nextConfig
