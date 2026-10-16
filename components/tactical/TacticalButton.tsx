import React from 'react'
import { Loader2 } from 'lucide-react'

interface TacticalButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  icon?: React.ReactNode
  iconPosition?: 'left' | 'right'
  loading?: boolean
  children?: React.ReactNode
}

export function TacticalButton({
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: TacticalButtonProps) {
  let baseStyles =
    'inline-flex items-center justify-center gap-2 whitespace-nowrap flex-nowrap font-mono uppercase font-bold tracking-wider rounded-[4px] border transition-all duration-150 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-app disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none'

  let variantStyles = ''
  if (variant === 'primary') {
    variantStyles =
      'bg-accent text-black border-accent hover:bg-accent-hover hover:border-accent-hover active:bg-warn-solid'
  } else if (variant === 'secondary') {
    variantStyles =
      'bg-panel-hover text-fg border-line-strong hover:bg-line-dim hover:border-fg-low active:bg-charcoal'
  } else if (variant === 'danger') {
    variantStyles =
      'bg-alert-dim text-danger border-alert-line hover:bg-danger hover:text-white hover:border-danger active:bg-danger-mid'
  } else if (variant === 'outline') {
    variantStyles =
      'bg-transparent text-fg border-line hover:border-accent hover:text-accent active:bg-night-low'
  } else if (variant === 'ghost') {
    variantStyles =
      'bg-transparent text-fg-muted border-transparent hover:text-fg hover:bg-raised active:bg-panel-hover'
  }

  let sizeStyles = ''
  if (size === 'sm') {
    sizeStyles = 'px-3 py-1.5 text-[11px] h-8'
  } else if (size === 'md') {
    sizeStyles = 'px-4 py-2 text-xs h-9'
  } else if (size === 'lg') {
    sizeStyles = 'px-6 py-2.5 text-sm h-11'
  }

  return (
    <button
      disabled={disabled || loading}
      className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <>
          {icon && iconPosition === 'left' && <span className="inline-flex items-center justify-center shrink-0">{icon}</span>}
          {children}
          {icon && iconPosition === 'right' && <span className="inline-flex items-center justify-center shrink-0">{icon}</span>}
        </>
      )}
    </button>
  )
}
