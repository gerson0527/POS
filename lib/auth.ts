import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'
import { sendWelcomeEmail } from '@/lib/email'

export const auth = betterAuth({
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET || 'pos-dian-tactical-secret-key-2026-secure',
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
