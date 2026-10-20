'use client'

import { StatusBadge } from '@/components/tactical/StatusBadge'
import { Pagination } from '@/components/tactical/Pagination'
import { SearchInput } from '@/components/ui/SearchInput'
import { formatCOP } from '@/lib/utils/pos-utils'

const ITEMS_PER_PAGE = 20

interface ProductGridProps {
  products: any[]
  filteredCount: number
  searchQuery: string
  onSearchChange: (value: string) => void
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  onAdd: (product: any) => void
}

export function ProductGrid({
  products,
  filteredCount,
  searchQuery,
  onSearchChange,
  currentPage,
  totalPages,
  onPageChange,
  onAdd,
}: ProductGridProps) {
  return (
    <div className="lg:col-span-2 flex flex-col justify-between min-h-0 space-y-3">
      {/* Search Bar */}
      <SearchInput
        size="lg"
        wrapperClassName="shrink-0"
        inputClassName="font-mono"
        placeholder="BUSCAR PRODUCTO POR NOMBRE O CÓDIGO SKU..."
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* Products Grid (Paginated) */}
      <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 content-start auto-rows-max overflow-y-auto pr-1">
        {filteredCount === 0 ? (
          <div className="col-span-full bg-panel border border-line rounded p-8 text-center font-mono text-xs text-fg-muted">
            [NO SE ENCONTRARON PRODUCTOS REGISTRADOS QUE COINCIDAN CON LA BÚSQUEDA]
          </div>
        ) : (
          products.map((product) => (
            <div
              key={product.id}
              onClick={() => onAdd(product)}
              title={product.name}
              className="bg-panel border border-line rounded-[6px] p-2.5 cursor-pointer hover:border-accent hover:bg-night-mid transition-[background-color,border-color,transform] duration-150 active:scale-[0.98] flex flex-col justify-between group h-[110px]"
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="font-mono text-[9px] text-fg-muted uppercase tracking-wider font-bold truncate">
                    {product.sku || `SKU-${product.id.substring(0, 6)}`}
                  </span>
                  <StatusBadge
                    status={Number(product.quantity || 0) > 0 ? 'online' : 'critical'}
                    label={`STOCK: ${product.quantity || 0}`}
                  />
                </div>
                <h3 className="font-mono text-[11px] font-bold text-fg group-hover:text-accent transition-colors line-clamp-2 leading-tight">
                  {product.name}
                </h3>
              </div>

              <div className="pt-1.5 border-t border-line-soft flex items-center justify-between mt-auto">
                <span className="font-mono text-[11px] font-bold text-success">
                  {formatCOP(Number(product.unitPrice))}
                </span>
                <div className="w-5 h-5 rounded bg-panel-hover border border-line-strong flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white font-bold text-xs transition-[background-color,color,transform] duration-150 group-active:scale-90">
                  +
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls Component */}
      <div className="shrink-0 pt-1">
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredCount}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={onPageChange}
        />
      </div>
    </div>
  )
}
