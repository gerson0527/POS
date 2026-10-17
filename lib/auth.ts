import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email'

// Seguridad (H-1): sin secreto NO se arranca. Nunca usar un valor por defecto
// conocido: permitiría a cualquiera forjar cookies de sesión.
const authSecret = process.env.BETTER_AUTH_SECRET
if (!authSecret) {
  throw new Error(
    'BETTER_AUTH_SECRET no está definida: el servidor no puede firmar sesiones de forma segura.'
  )
}

export const auth = betterAuth({
  database: pool,
  secret: authSecret,
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await sendWelcomeEmail(user.email, user.name || 'Operador POS', 'OPERADOR')
          } catch (err) {
            console.error('Error enviando correo de bienvenida:', err)
          }
        },
      },
    },
  },
  baseURL:
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL || 'http://localhost:3000'),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    // Seguridad (H-6): política mínima de contraseñas.
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  // Seguridad (H-6): límite de intentos en endpoints de autenticación (anti fuerza bruta).
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
  },
  trustedOrigins: [
    'http://localhost:3000',
    'http://localhost:3001',
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]
      : []),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  ...(process.env.NODE_ENV === 'development' && process.env.V0_RUNTIME_URL
    ? {
        advanced: {
          defaultCookieAttributes: {
            sameSite: 'none' as const,
            secure: true,
          },
        },
      }
    : {}),
})
