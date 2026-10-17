'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

export interface SearchableOption {
  value: string
  label: string
  description?: string
  searchText?: string
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  emptyLabel?: string
  className?: string
  maxResults?: number
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Buscar…',
  emptyLabel,
  className = '',
  maxResults = 100,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? options.filter((o) => (o.searchText ?? `${o.label} ${o.description ?? ''}`).toLowerCase().includes(q))
      : options
    return base.slice(0, maxResults)
  }, [options, query, maxResults])

  const hiddenCount = useMemo(() => {
    const q = query.trim().toLowerCase()
    const total = q
      ? options.filter((o) => (o.searchText ?? `${o.label} ${o.description ?? ''}`).toLowerCase().includes(q)).length
      : options.length
    return Math.max(0, total - filtered.length)
  }, [options, query, filtered.length])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [])

  function select(option: SearchableOption | null) {
    onChange(option ? option.value : '')
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="flex items-center gap-2 h-full bg-input border border-line rounded px-2.5 focus-within:border-accent transition-colors">
        <Search className="w-3.5 h-3.5 text-fg-muted shrink-0" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          value={open ? query : selected?.label ?? ''}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (open && filtered.length > 0) select(filtered[0])
            } else if (e.key === 'Escape' && open) {
              e.preventDefault()
              setOpen(false)
              setQuery('')
            }
          }}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none text-xs text-fg truncate"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0 text-fg-muted hover:text-fg transition-colors"
          aria-label="Abrir lista"
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto bg-panel border border-line rounded shadow-xl">
          {emptyLabel && (
            <button
              type="button"
              tabIndex={-1}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => select(null)}
              className="w-full text-left px-3 py-2 text-[11px] text-fg-muted hover:bg-hover border-b border-line-soft"
            >
              {emptyLabel}
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-[11px] text-fg-muted">Sin resultados</div>
          ) : (
            filtered.map((o) => (
              <button
                type="button"
                key={o.value}
                tabIndex={-1}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(o)}
                className={`w-full text-left px-3 py-2 hover:bg-hover transition-colors ${
                  o.value === value ? 'bg-hover' : ''
                }`}
              >
                <div className="text-xs text-fg truncate">{o.label}</div>
                {o.description && (
                  <div className="text-[10px] text-fg-muted truncate">{o.description}</div>
                )}
              </button>
            ))
          )}

          {hiddenCount > 0 && (
            <div className="px-3 py-1.5 text-center text-[10px] text-fg-faint border-t border-line-soft">
              {hiddenCount} resultado(s) más · refine la búsqueda
            </div>
          )}
        </div>
      )}
    </div>
  )
}
