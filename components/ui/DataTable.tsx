import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'

export interface DataTableColumn<T> {
  key: string
  header: ReactNode
  align?: 'left' | 'right' | 'center'
  thClassName?: string
  cellClassName?: string
  render?: (row: T, index: number) => ReactNode
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string | number
  emptyMessage?: ReactNode
  rowClassName?: string | ((row: T, index: number) => string)
  tableClassName?: string
  theadClassName?: string
  tbodyClassName?: string
  wrapperClassName?: string
}

const ALIGN_CLASS = {
  left: '',
  right: 'text-right',
  center: 'text-center',
} as const

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyMessage = '[NO HAY REGISTROS]',
  rowClassName,
  tableClassName = 'w-full text-left text-xs',
  theadClassName = 'bg-surface border-b border-line text-fg-muted uppercase text-[11px]',
  tbodyClassName = 'divide-y divide-night-mid',
  wrapperClassName = 'overflow-x-auto',
}: DataTableProps<T>) {
  return (
    <div className={wrapperClassName}>
      <table className={tableClassName}>
        <thead className={theadClassName}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 ${ALIGN_CLASS[col.align ?? 'left']} ${col.thClassName ?? ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={tbodyClassName}>
          {rows.length === 0 ? (
            <EmptyState message={emptyMessage} colSpan={columns.length} />
          ) : (
            rows.map((row, index) => {
              const extra =
                typeof rowClassName === 'function'
                  ? rowClassName(row, index)
                  : (rowClassName ?? 'hover:bg-ash transition-colors')
              return (
                <tr key={rowKey(row, index)} className={extra}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${ALIGN_CLASS[col.align ?? 'left']} ${col.cellClassName ?? ''}`}
                    >
                      {col.render
                        ? col.render(row, index)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
