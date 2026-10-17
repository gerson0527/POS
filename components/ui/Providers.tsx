'use client'

import type { ReactNode } from 'react'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './ToastProvider'
import { ConfirmProvider } from './ConfirmProvider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <ToastProvider>{children}</ToastProvider>
      </ConfirmProvider>
    </ThemeProvider>
  )
}
