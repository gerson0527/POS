import type { ReactNode } from 'react'

export function EmptyState({
  message,
  colSpan,
}: {
  message: ReactNode
  colSpan: number
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-fg-muted">
        {message}
      </td>
    </tr>
  )
}
