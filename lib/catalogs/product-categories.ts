// Categoría predeterminada del catálogo. Se crea automáticamente por tenant
// y se usa cuando un producto no tiene una categoría asignada.

export const DEFAULT_PRODUCT_CATEGORY_NAME = 'Sin categoría'
export const DEFAULT_PRODUCT_CATEGORY_SLUG = 'sin-categoria'
export const DEFAULT_PRODUCT_CATEGORY_COLOR = '#6B7280'
export const DEFAULT_PRODUCT_CATEGORY_DESCRIPTION =
  'Productos del catálogo que aún no tienen una categoría asignada.'

export function isDefaultProductCategory(slug?: string | null): boolean {
  return slug === DEFAULT_PRODUCT_CATEGORY_SLUG
}
