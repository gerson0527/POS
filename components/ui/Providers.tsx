'use client'

import type { ReactNode } from 'react'
import { ToastProvider } from './ToastProvider'
import { ConfirmProvider } from './ConfirmProvider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfirmProvider>
      <ToastProvider>{children}</ToastProvider>
    </ConfirmProvider>
  )
}
