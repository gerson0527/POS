import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from '@/components/ui/Providers'

export const metadata: Metadata = {
  title: 'POS DIAN // TACTICAL OPS CENTER',
  description: 'Sistema de Punto de Venta e Integración Fiscal DIAN Colombia',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#0b0b0b',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="dark scroll-smooth">
      <body className="antialiased bg-app text-fg selection:bg-accent selection:text-black">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
