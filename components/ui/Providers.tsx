'use client'

import type { ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { ThemeProvider } from './ThemeProvider'
import { ToastProvider } from './ToastProvider'
import { ConfirmProvider } from './ConfirmProvider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <ConfirmProvider>
        <ToastProvider>
          <MotionConfig reducedMotion="user">{children}</MotionConfig>
        </ToastProvider>
      </ConfirmProvider>
    </ThemeProvider>
  )
}
