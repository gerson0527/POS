'use client'

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems?: number
  itemsPerPage?: number
  onPageChange: (page: number) => void
  className?: string
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null

  const startItem = totalItems && itemsPerPage ? (currentPage - 1) * itemsPerPage + 1 : null
  const endItem = totalItems && itemsPerPage ? Math.min(currentPage * itemsPerPage, totalItems) : null

  // Generate page numbers array with ellipsis for clean UI
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)

      if (currentPage > 3) {
        pages.push('...')
      }

      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (currentPage < totalPages - 2) {
        pages.push('...')
      }

      pages.push(totalPages)
    }
    return pages
  }

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs py-3 px-4 bg-veil border border-line-deep rounded-[6px] ${className}`}
    >
      {/* Items Counter Info */}
      <div className="text-fg-muted flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
        {startItem && endItem && totalItems ? (
          <span>
            MOSTRANDO <strong className="text-fg">{startItem}</strong> -{' '}
            <strong className="text-fg">{endItem}</strong> DE{' '}
            <strong className="text-accent">{totalItems}</strong> REGISTROS
          </span>
        ) : (
          <span>
            PÁGINA <strong className="text-fg">{currentPage}</strong> DE{' '}
            <strong className="text-accent">{totalPages}</strong>
          </span>
        )}
      </div>

      {/* Page Navigation Controls */}
      <div className="flex items-center gap-1.5">
        {/* First Page */}
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          title="Primera Página"
          className="p-1.5 rounded bg-hover border border-line text-fg hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-fg transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" />
        </button>

        {/* Prev Page */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          title="Página Anterior"
          className="p-1.5 rounded bg-hover border border-line text-fg hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-fg transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Numbered Buttons */}
        <div className="flex items-center gap-1 mx-1">
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`dots-${idx}`} className="px-2 text-fg-faint">
                  ...
                </span>
              )
            }

            const pageNum = page as number
            const isActive = pageNum === currentPage

            return (
              <button
                key={pageNum}
                onClick={() => onPageChange(pageNum)}
                className={`min-w-[28px] h-7 px-2 rounded text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-hover border border-line text-fg hover:border-accent hover:text-accent'
                }`}
              >
                {pageNum}
              </button>
            )
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          title="Página Siguiente"
          className="p-1.5 rounded bg-hover border border-line text-fg hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-fg transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Last Page */}
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          title="Última Página"
          className="p-1.5 rounded bg-hover border border-line text-fg hover:border-accent hover:text-accent disabled:opacity-30 disabled:hover:border-line disabled:hover:text-fg transition-colors"
        >
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
