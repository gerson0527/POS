// pdf-generator.ts — Reporte de inventario en PDF (Fase 26: render vía lib/reports/render.ts,
// con browser singleton y escapeHtml compartidos).

import { escapeHtml, renderPdf } from './render'

export interface InventoryReportData {
  title: string
  generatedAt: string
  tenant: {
    name: string
    nit: string
  }
  location: string
  data: Array<{
    sku: string
    name: string
    category: string
    quantity: number
    cost: number
    value: number
  }>
  totals: {
    totalUnits: number
    totalValue: number
  }
}

export async function generateInventoryReport(data: InventoryReportData): Promise<Buffer> {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          header { margin-bottom: 30px; }
          h1 { color: #333; }
          .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
          .info-box { background: #f5f5f5; padding: 10px; border-radius: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #333; color: white; padding: 10px; text-align: left; }
          td { padding: 8px; border-bottom: 1px solid #ddd; }
          tr:nth-child(even) { background: #f9f9f9; }
          .totals { background: #333; color: white; font-weight: bold; }
          .footer { margin-top: 30px; text-align: center; color: #999; }
        </style>
      </head>
      <body>
        <header>
          <h1>REPORTE DE INVENTARIO</h1>
          <p>Generado el: ${escapeHtml(data.generatedAt)}</p>
        </header>

        <div class="info-grid">
          <div class="info-box">
            <strong>Empresa:</strong> ${escapeHtml(data.tenant.name)}<br>
            <strong>NIT:</strong> ${escapeHtml(data.tenant.nit)}
          </div>
          <div class="info-box">
            <strong>Ubicación:</strong> ${escapeHtml(data.location)}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Nombre Producto</th>
              <th>Categoría</th>
              <th style="text-align: right;">Cantidad</th>
              <th style="text-align: right;">Costo Unit.</th>
              <th style="text-align: right;">Valor Total</th>
            </tr>
          </thead>
          <tbody>
            ${data.data
              .map(
                (item) => `
              <tr>
                <td>${escapeHtml(item.sku)}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${escapeHtml(item.category)}</td>
                <td style="text-align: right;">${item.quantity}</td>
                <td style="text-align: right;">$${item.cost.toFixed(2)}</td>
                <td style="text-align: right;">$${item.value.toFixed(2)}</td>
              </tr>
            `
              )
              .join('')}
            <tr class="totals">
              <td colspan="3"></td>
              <td style="text-align: right;">${data.totals.totalUnits} unidades</td>
              <td></td>
              <td style="text-align: right;">$${data.totals.totalValue.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <p>Este reporte fue generado automáticamente por el Sistema POS DIAN</p>
        </div>
      </body>
    </html>
  `

  try {
    return await renderPdf(html)
  } catch (error) {
    console.error('Error generating PDF:', error)
    throw new Error('Failed to generate PDF report')
  }
}
