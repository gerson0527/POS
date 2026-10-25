// render.ts — Capa de renderizado PDF con Puppeteer (Fase 26, §7.4).
//
// Antes cada generador abría y cerraba un Chrome nuevo (y con flags
// inconsistentes de sandbox). Aquí vive UN browser singleton por proceso
// (se relanza si murió) + escapeHtml como fuente única para interpolación
// segura en los templates HTML.
//
// En runtime serverless (Vercel/Lambda) el cache ~/.cache/puppeteer no viaja
// en el bundle, así que el binario de Chrome viene de @sparticuz/chromium.

import puppeteer, { Browser, type LaunchOptions } from 'puppeteer'

/** Escapa texto para interpolación segura en los templates HTML de los PDF. */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

let browserPromise: Promise<Browser> | null = null

/** Runtime serverless (Vercel Functions / AWS Lambda): no hay ~/.cache local. */
function isServerlessRuntime(): boolean {
  return Boolean(process.env.LAMBDA_TASK_ROOT || process.env.VERCEL_REGION)
}

function sandboxArgs(): string[] {
  // --no-sandbox es necesario en contenedores/CI sin user namespaces.
  // Opt-out con PUPPETEER_SANDBOX=1 en entornos donde el sandbox ya está activo.
  return process.env.PUPPETEER_SANDBOX === '1'
    ? []
    : ['--no-sandbox', '--disable-setuid-sandbox']
}

async function launchOptions(): Promise<LaunchOptions> {
  if (!isServerlessRuntime()) {
    return { headless: true, args: sandboxArgs() }
  }
  // Import dinámico: @sparticuz/chromium es runtime de Linux (Amazon Linux 2023)
  // y no se toca en dev. Su binario es chrome-headless-shell: exige headless:'shell'
  // (--headless=new no soportado) y ya trae --no-sandbox/--no-zygote en chromium.args.
  const chromium = (await import('@sparticuz/chromium')).default
  return {
    args: [...chromium.args],
    headless: 'shell',
    executablePath: await chromium.executablePath(),
  }
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch(await launchOptions()).catch((err) => {
      browserPromise = null
      throw err
    })
  }
  const browser = await browserPromise
  if (!browser.connected) {
    // El browser singleton murió (idle timeout del SO o crash): se relanza una vez.
    browserPromise = null
    return getBrowser()
  }
  return browser
}

export interface RenderPdfOptions {
  format?: 'A4' | 'Letter'
  margin?: { top: number; right: number; bottom: number; left: number }
}

/** Renderiza HTML completo a PDF Buffer reutilizando el browser singleton. */
export async function renderPdf(html: string, opts?: RenderPdfOptions): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format: opts?.format ?? 'A4',
      margin: opts?.margin ?? { top: 20, right: 20, bottom: 20, left: 20 },
    })
    return Buffer.from(pdf)
  } finally {
    // La página SIEMPRE se cierra (el browser singleton queda vivo para el siguiente PDF).
    await page.close().catch(() => {})
  }
}
