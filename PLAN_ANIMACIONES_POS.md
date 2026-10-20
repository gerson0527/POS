# Plan de animaciones UI/UX — POS DIAN

> **Estado:** propuesta para revisión. Este documento no instala dependencias ni modifica código.
> **Fecha:** 2026-10-20
> **Stack revisado:** Next.js 16.2.6 (App Router) + React 19 + Tailwind CSS 4.3 + `tw-animate-css` + Tauri 2.
> **Objetivo:** añadir movimiento con propósito al punto de venta, sin sacrificar velocidad, accesibilidad ni rendimiento en equipos de caja de gama baja.

---

## 1. Resumen ejecutivo

La recomendación es adoptar **Motion** como librería principal y **AutoAnimate** únicamente para listas dinámicas (carrito y líneas de pago).

- **Sí instalar:** `motion` y `@formkit/auto-animate`.
- **Ya disponible:** `tw-animate-css`, importado en `app/globals.css`. Sirve para entradas/salidas simples por CSS y evita añadir Animate.css.
- **No instalar por ahora:** Anime.js, Animate.css y Lottie.
- **Prioridad:** flujo de venta (`producto → carrito → pago → éxito`), no pantallas decorativas.
- **Regla de oro:** ninguna animación debe retrasar una venta, bloquear un botón o ser la única forma de comunicar un estado.

El proyecto ya tiene una base visual táctica y sobria. Las animaciones deben reforzar esa identidad, no convertirla en una demo. Movimientos cortos (120–280 ms), discretos y consistentes.

---

## 2. Lectura del proyecto

### 2.1 Stack y estructura relevante

| Elemento | Estado actual |
|---|---|
| Framework | Next.js 16.2.6, App Router |
| React | 19 |
| Estilos | Tailwind CSS 4.3, tokens CSS en `app/globals.css` |
| Utilidades de animación | `tw-animate-css` ya importado |
| Componentes UI | `components/ui/Modal.tsx`, `ToastProvider.tsx`, `DataTable.tsx`, etc. |
| POS principal | `app/dashboard/pos/page.tsx` + `components/pos/*` |
| POS Tauri | `app/dashboard/pos-terminal/page.tsx` |
| Caja | `app/dashboard/cashier/page.tsx` |
| Dashboard | `app/dashboard/page.tsx`, componentes de servidor |
| Reportes | `app/dashboard/reports/page.tsx` con Recharts |
| Desktop | Tauri 2 (`src-tauri`) |

### 2.2 Animaciones y transiciones existentes

- `tw-animate-css` se usa en toasts: `animate-in fade-in duration-200`.
- `StatusBadge` usa `animate-ping` para el punto de estado.
- La alerta de turno vencido del POS y algunos badges usan `animate-pulse`.
- `TacticalButton` y varios controles usan `transition-all` o `transition-colors`.
- `DataTable` usa transiciones de color en hover.
- El sidebar móvil ya tiene `transition-transform duration-200`.
- `ThemeProvider` ya usa `disableTransitionOnChange`, correcto para no animar el cambio de tema.
- No hay librería de animación instalada.
- No hay soporte explícito de `prefers-reduced-motion`.

### 2.3 Restricciones detectadas

1. **`Modal` retorna `null` cuando está cerrado.** Muchos llamadores lo montan condicionalmente (`{open && <Modal ... />}`). Por eso una animación de salida requeriría refactorizar ~25 usos. La entrada sí se puede animar sin tocar los llamadores.
2. **Los modales no usan portal.** Se renderizan dentro del árbol de la página. Un ancestro con `transform` puede romper `position: fixed`; hay que evitarlo en transiciones de página.
3. **El dashboard tiene componentes de servidor.** Las animaciones de esas secciones deben ser CSS, no Motion, para no convertir páginas completas en client components.
4. **El POS corre también en Tauri.** El peso del bundle y el consumo de CPU importan más que en una web de marketing.
5. **Hay impresión térmica y reportes Z.** Ninguna animación debe afectar `@media print`.
6. **El flujo de pago es crítico.** La animación no puede tapar errores, retrasar el cobro ni dar una sensación falsa de progreso.

---

## 3. Criterios de selección

| Criterio | Pregunta |
|---|---|
| Propósito | ¿Comunica un cambio de estado o solo decora? |
| Velocidad | ¿Se percibe inmediato? Rango objetivo: 90–280 ms. |
| Rendimiento | ¿Anima solo `transform` y `opacity`? |
| Accesibilidad | ¿Respeta `prefers-reduced-motion`? ¿No depende del color/movimiento? |
| Bundle | ¿Cuánto añade al cliente y a Tauri? |
| Mantenimiento | ¿Se integra con React 19 y Next 16 sin hacks? |
| Riesgo | ¿Puede romper foco, layout, impresión o `position: fixed`? |

---

## 4. Evaluación de las opciones

### 4.1 Motion (`motion`)

**Fortalezas**

- Integración React de primera clase: `motion/react`.
- `AnimatePresence` para entrada/salida de toasts y overlays.
- `layout` y `layoutId` para transiciones de estado (por ejemplo, el paso activo del POS).
- `MotionConfig reducedMotion="user"` y `useReducedMotion`.
- Tree-shakeable; se puede usar `LazyMotion` si el bundle se vuelve un problema.
- Excelente para microinteracciones del flujo de venta.

**Debilidades**

- Es una dependencia nueva de peso medio.
- No corrige por sí sola el problema de montaje/desmontaje de los modales actuales.
- Un uso excesivo de `layout` en listas grandes puede costar rendimiento.

**Uso propuesto**

- Entrada de modales.
- Entrada/salida y apilado de toasts.
- Transición del paso activo en `PosHeader`.
- Pulso del total.
- Overlay de venta exitosa con SVG animado.
- Transiciones de pasos en onboarding.
- Configuración global de movimiento reducido.

**Veredicto:** adoptar.

---

### 4.2 AutoAnimate (`@formkit/auto-animate`)

**Fortalezas**

- Muy liviano.
- Una sola línea para animar altas, bajas y reordenamientos dentro de un contenedor.
- Ideal para el ticket/carrito y para las líneas de pago dividido.
- Respeta `prefers-reduced-motion` por defecto.

**Debilidades**

- No es una librería de coreografía: no sirve para modales ni secuencias complejas.
- No conviene usarla en tablas grandes ni en listas que cambian constantemente.
- Si se abusa, cada mutación del DOM puede generar animaciones no deseadas.

**Uso propuesto**

- Lista de ítems del carrito (`CartPanel`).
- Líneas de pago dividido (`PaymentModal`).
- Quizá lista de pasos del onboarding, no prioritario.

**Veredicto:** adoptar con alcance limitado.

---

### 4.3 Anime.js (`animejs`)

**Fortalezas**

- Muy potente para SVG, atributos, objetos y animaciones vanilla.
- Buena para animaciones muy específicas de marketing o ilustraciones.

**Debilidades**

- No es React-first; habría que gestionar refs, ciclo de vida y limpieza.
- Duplica capacidades que Motion ya cubre para este proyecto.
- Añade otra API y otra dependencia que mantener.
- El POS no necesita animaciones SVG complejas.

**Uso propuesto**

- Ninguno en la versión inicial.

**Veredicto:** descartar. Reevaluar solo si aparece una animación SVG muy concreta que Motion no cubra bien.

---

### 4.4 Animate.css (`animate.css`)

**Fortalezas**

- Muy fácil de usar con clases.
- Útil para prototipos rápidos.

**Debilidades**

- El proyecto ya tiene `tw-animate-css`, que cubre `animate-in`, `fade-in`, `slide-in-from-*`, `zoom-in-*`, etc.
- No resuelve salidas, orquestación ni estado.
- Otra hoja de estilos global para duplicar utilidades.

**Uso propuesto**

- Ninguno. Usar `tw-animate-css` para entradas simples.

**Veredicto:** descartar.

---

### 4.5 Lottie / lottie-web

**Fortalezas**

- Animaciones exportadas de After Effects con buena calidad visual.
- Útil para onboarding, marketing o una animación de éxito muy elaborada.

**Debilidades**

- Runtime pesado y JSON adicional.
- Coste de CPU/memoria en cajas de gama baja y en Tauri.
- Para un POS, un check animado con SVG + Motion comunica lo mismo con una fracción del coste.
- Añade dependencia, assets y mantenimiento de diseño.

**Uso propuesto**

- Ninguno en la versión inicial.
- Si se usa más adelante: solo en éxito de venta u onboarding, con carga diferida, JSON pequeño y fallback estático.

**Veredicto:** aplazar. No es necesario para la primera versión.

---

### 4.6 Matriz comparativa

| Herramienta | Encaje React/Next | Peso | Rendimiento POS | Facilidad | Veredicto |
|---|---:|---:|---:|---:|---|
| Motion | Alto | Medio | Alto | Alta | **Adoptar** |
| AutoAnimate | Alto | Muy bajo | Alto | Muy alta | **Adoptar en listas** |
| Anime.js | Medio | Medio | Medio | Media | Descartar |
| Animate.css | Bajo | Bajo | Alto | Muy alta | Descartar (ya hay `tw-animate-css`) |
| Lottie | Medio | Alto | Bajo | Media | Aplazar |

---

## 5. Decisión recomendada

### 5.1 Dependencias

```bash
npm install motion
npm install @formkit/auto-animate
```

No instalar `animate.css`, `animejs` ni `lottie-web`/`lottie-react` en esta fase.

### 5.2 Reparto de responsabilidades

| Necesidad | Herramienta |
|---|---|
| Entrada/salida de toasts | Motion |
| Entrada de modales | Motion |
| Paso activo del POS | Motion |
| Éxito de venta con check SVG | Motion |
| Lista del carrito | AutoAnimate |
| Líneas de pago dividido | AutoAnimate |
| Entradas simples de CSS | `tw-animate-css` |
| Hover, focus, press | Tailwind/CSS |
| Cards del dashboard | CSS |
| Gráficas de reportes | Recharts + configuración de duración |

---

## 6. Sistema de movimiento

### 6.1 Tokens propuestos

Añadir en `app/globals.css`:

```css
:root {
  --motion-fast: 120ms;
  --motion-base: 180ms;
  --motion-slow: 280ms;
  --motion-success: 420ms;

  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

| Token | Uso |
|---|---|
| `--motion-fast` | Hover, press, cambio de color, pulso de total |
| `--motion-base` | Entrada de modal, toast, item de carrito |
| `--motion-slow` | Overlay de éxito, onboarding |
| `--motion-success` | Check de venta completada |
| `--ease-out` | Entradas y feedback |
| `--ease-in-out` | Cambios de estado reversibles |

### 6.2 Reglas

- Entradas: `opacity` + `translateY(4–8px)` o `scale(0.97–1)`.
- Salidas: más rápidas que las entradas (120–150 ms).
- No usar desplazamientos mayores a 12 px en pantallas operativas.
- No animar `width`, `height`, `top`, `left` ni `margin`.
- Evitar animar `box-shadow` y `filter`; el `backdrop-blur` del modal debe quedarse estático.
- Un solo foco de atención por acción.
- Si una acción tarda más de 300 ms, mostrar estado de procesamiento, no una animación larga.

### 6.3 Movimiento reducido

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Además, envolver la app con `MotionConfig`:

```tsx
'use client'

import { MotionConfig } from 'motion/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      {/* providers existentes */}
      {children}
    </MotionConfig>
  )
}
```

AutoAnimate respeta la preferencia por defecto. No cambiar `disrespectUserMotionPreference`.

---

## 7. Mapa de animaciones por pantalla

### 7.1 Flujo de venta (prioridad alta)

| Momento | Animación | Tecnología |
|---|---|---|
| Click en producto | `active:scale-[0.98]` y borde de acento | CSS |
| Producto agregado | El nuevo ítem entra al ticket con fade + altura | AutoAnimate |
| Cambio de cantidad | El número hace un pulso de 120 ms | CSS/Motion |
| Cambio de total | El total se desplaza 3 px y vuelve | Motion |
| Avance a pago | Modal entra con fade + scale | Motion |
| Error de validación | Shake corto de 180 ms, una sola vez | Motion/CSS |
| Procesando pago | Spinner + texto, sin barra falsa | CSS |
| Venta exitosa | Check SVG dibujado + total | Motion |
| Venta con error DIAN | Toast de error; no bloquear la venta local | Motion |

**No hacer:** animación “fly to cart”, confeti, partículas o un overlay de éxito de 3 segundos. El cajero necesita volver a vender.

### 7.2 Modales

- Backdrop: fade de 150 ms.
- Panel: fade + `scale(0.97 → 1)` + `translateY(8px → 0)` en 180 ms.
- El foco debe seguir funcionando desde el primer frame; no retrasar el `focus()`.
- **Salida:** no implementar en la primera fase. Los llamadores desmontan el modal inmediatamente. Para animar la salida habría que refactorizar los ~25 usos para mantener el componente montado y controlar `open`.
- Si se hace la salida más adelante: `AnimatePresence` dentro de `Modal`, sin desmontar desde el padre.

### 7.3 Toasts

- Entrada: fade + `y: -8` + `scale(0.98)` en 160 ms.
- Salida: fade + `scale(0.98)` en 120 ms.
- `layout` para que los toasts restantes se reacomoden.
- Máximo 3 visibles; el resto se descarta o se agrupa.
- Colores y texto ya existen; no animar el icono de forma continua.

### 7.4 Caja y cierre

- Apertura/cierre: toast de éxito; no hace falta una animación adicional.
- Reporte Z: usar la entrada estándar de modal.
- Diferencia de arqueo: transición de color, sin count-up por cada tecla.
- No animar la tabla de historial completa.

### 7.5 Dashboard y reportes

- Cards: entrada CSS con `opacity` + `translateY(4px)`, máximo 6 cards, 40 ms de stagger.
- No convertir `MetricCard` en client component solo para contar números. Si se quiere count-up, crear un `AnimatedNumber` cliente pequeño y usarlo solo donde aporte.
- Recharts: `animationDuration={250}`, desactivar con `useReducedMotion` si se añade el hook.
- No animar tablas de datos en cada refresco.

### 7.6 Navegación y onboarding

- Sidebar móvil: conservar `transition-transform`; añadir backdrop con fade.
- Cambio de página: como máximo `opacity` de 120 ms. **No usar `transform` en un wrapper de página**: los modales son `position: fixed` y un ancestro transformado los posiciona mal.
- Si no hay presupuesto para probar la transición de página, omitirla. El POS gana más con microinteracciones locales.
- Onboarding: contenido del paso con fade + slide de 6 px; barra de progreso con `transition-[width]` de 180 ms.

### 7.7 Tablas y estados

- Hover de fila: mantener `transition-colors`.
- Entrada de filas: opcional, solo en carga inicial, máximo 8 filas y solo `opacity`.
- `animate-pulse` continuo: limitarlo a puntos de estado pequeños. La alerta completa de turno vencido del POS no debería pulsar entera; usar un icono estático y un badge pequeño.
- `animate-ping`: conservar solo en el punto “en línea” o en estados que realmente requieran atención.

---

## 8. Qué no animar

- Filas completas de tablas en cada filtro o paginación.
- Inputs mientras el usuario escribe.
- Todos los productos del grid al cargar o paginar.
- Cambios de tema globales.
- Elementos imprimibles o cualquier cosa dentro de `#invoice-printable` / `#z-report-printable`.
- Animaciones en bucle en el POS (salvo un punto de estado pequeño).
- `box-shadow`, `filter`, `backdrop-filter` o `width/height` en listas grandes.
- Transiciones de salida de página en App Router.
- Animaciones que bloqueen el botón de cobro o retrasen la llamada al servidor.

---

## 9. Plan de implementación

| Fase | Alcance | Archivos principales | Esfuerzo | Riesgo |
|---|---|---|---:|---|
| 0 | Tokens, `prefers-reduced-motion`, `MotionConfig` | `app/globals.css`, `components/ui/Providers.tsx` | 0.5 día | Bajo |
| 1 | Entrada de modales y toasts | `components/ui/Modal.tsx`, `ToastProvider.tsx` | 1 día | Bajo |
| 2 | Carrito, producto y total | `CartPanel.tsx`, `ProductGrid.tsx`, `TotalsBreakdown.tsx` | 1.5 días | Medio |
| 3 | Pago, éxito y caja | `PaymentModal.tsx`, `app/dashboard/pos/page.tsx`, `cashier/page.tsx` | 1.5 días | Medio |
| 4 | Dashboard, onboarding y navegación | `dashboard/page.tsx`, `onboarding/page.tsx`, `template.tsx` | 1 día | Medio |
| 5 | QA de rendimiento, accesibilidad e impresión | — | 1 día | Bajo |

**Total estimado:** 6–7 días de implementación y prueba.

### Orden recomendado

1. Fase 0 y 1: base global y mejor percepción inmediata.
2. Fase 2: el carrito es donde el usuario pasa más tiempo.
3. Fase 3: pago y éxito, con cuidado de no bloquear.
4. Fase 4: solo si las fases anteriores están estables.
5. Fase 5: medir antes de dar por cerrado.

---

## 10. Ejemplos de implementación

### 10.1 `MotionConfig` en Providers

```tsx
'use client'

import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
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
```

### 10.2 Entrada de modal sin refactorizar llamadores

Mantener el `if (!open) return null` y animar solo la entrada:

```tsx
import { motion } from 'motion/react'

// ...

if (!open) return null

return (
  <motion.div
    className={`fixed inset-0 bg-black/80 backdrop-blur-sm ${zIndexClass} flex items-center justify-center p-4 no-print`}
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.15, ease: 'easeOut' }}
    role="dialog"
    aria-modal="true"
    aria-label={ariaLabel}
  >
    <motion.div
      ref={panelRef}
      className={panelClass}
      initial={{ opacity: 0, scale: 0.97, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* contenido existente */}
    </motion.div>
  </motion.div>
)
```

Nota: el `backdrop-blur` queda estático. Si el rendimiento en una caja antigua se resiente, animar solo el color de fondo del overlay y dejar el blur fijo.

### 10.3 Toasts con salida

```tsx
import { AnimatePresence, motion } from 'motion/react'

<AnimatePresence initial={false}>
  {items.map((t) => {
    const Icon = TYPE_ICON[t.type]
    return (
      <motion.div
        key={t.id}
        layout
        role="status"
        initial={{ opacity: 0, y: -8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className={`pointer-events-auto max-w-md border p-3 rounded-[6px] flex items-center gap-3 text-xs font-bold shadow-lg ${TYPE_STYLES[t.type]}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="min-w-0 break-words">{t.message}</span>
      </motion.div>
    )
  })}
</AnimatePresence>
```

### 10.4 Carrito con AutoAnimate

```tsx
import { useAutoAnimate } from '@formkit/auto-animate/react'

const [cartListRef] = useAutoAnimate<HTMLDivElement>({
  duration: 180,
  easing: 'ease-out',
})

// ...

<div ref={cartListRef} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
  {cart.map((item) => (
    <div key={item.productId}>{/* ítem existente */}</div>
  ))}
</div>
```

No usar AutoAnimate en el grid de productos ni en tablas grandes.

### 10.5 Total con micro-pulso

```tsx
import { motion } from 'motion/react'

<motion.span
  key={totals.total}
  initial={{ opacity: 0.65, y: 3 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.14, ease: 'easeOut' }}
  className="text-accent"
>
  {formatCOP(totals.total)}
</motion.span>
```

Evitar count-up en cada cambio de cantidad. Un pulso es más rápido y no distrae.

### 10.6 Éxito de venta con check SVG

```tsx
import { motion } from 'motion/react'

<div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
  <motion.svg
    viewBox="0 0 24 24"
    className="w-16 h-16 text-success"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <motion.path
      d="M20 6 9 17l-5-5"
      initial={{ pathLength: 0, opacity: 0 }}
      animate={{ pathLength: 1, opacity: 1 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    />
  </motion.svg>
  <div className="text-sm font-bold text-fg">VENTA REGISTRADA</div>
  <div className="font-mono text-2xl font-bold text-accent">{formatCOP(total)}</div>
</div>
```

La venta local no debe esperar a la animación. El overlay puede mostrarse después de que `completeSale` termine y cerrarse automáticamente en ~1.1 s o con click.

### 10.7 Transición de página solo con opacidad

`app/dashboard/template.tsx`:

```tsx
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
```

```css
@keyframes page-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

.page-enter {
  animation: page-enter var(--motion-fast) var(--ease-out) both;
}
```

No añadir `translateY` al wrapper de página. Un `transform` en un ancestro cambia el containing block de los modales `fixed`.

---

## 11. Accesibilidad

- Respetar `prefers-reduced-motion` en CSS, Motion y AutoAnimate.
- No comunicar estados solo con movimiento o color; mantener texto e iconos.
- Mantener `role="status"` y `aria-live="polite"` en toasts y éxito de venta.
- Añadir `aria-busy="true"` al formulario o modal mientras se procesa el pago.
- No mover el foco como parte de la animación.
- No usar parpadeos rápidos ni animaciones mayores a 3 Hz.
- Las animaciones de error deben ser breves y no repetirse en bucle.
- El modal ya tiene focus trap; la animación no debe retrasar el foco inicial.

---

## 12. Rendimiento y Tauri

- Animar preferentemente `transform` y `opacity`.
- Evitar `filter`, `backdrop-filter`, `box-shadow`, `width`, `height` y `top/left`.
- No animar listas de más de 20 elementos.
- Un solo `layout` animado a la vez.
- No usar `will-change` de forma permanente; solo si una medición lo justifica.
- Probar con CPU throttling 4x en DevTools.
- Verificar que el POS sigue respondiendo con 20 productos, carrito de 10 ítems y un modal abierto.
- Medir el bundle después de instalar Motion; si crece demasiado, evaluar `LazyMotion` con `domAnimation`.
- En Tauri, probar el mismo flujo en la ventana desktop, no solo en el navegador.
- Añadir `@media print { *, *::before, *::after { animation: none !important; transition: none !important; } }` si alguna animación queda dentro del área imprimible.

---

## 13. Pruebas y criterios de aceptación

### 13.1 Automáticas

```bash
npm run typecheck
npm test
npm run build
```

### 13.2 Manuales

- [ ] El modal abre y cierra sin saltos de layout.
- [ ] El foco entra al primer campo y Escape sigue cerrando.
- [ ] El toast entra, sale y no tapa el botón de cobro.
- [ ] Agregar el primer producto, el segundo y eliminar el último se siente fluido.
- [ ] Cambiar cantidad no provoca saltos en el total.
- [ ] El pago dividido anima líneas sin perder foco.
- [ ] El overlay de éxito no bloquea una nueva venta más de ~1.2 s.
- [ ] `prefers-reduced-motion` desactiva las animaciones no esenciales.
- [ ] La impresión de factura y reporte Z no cambia.
- [ ] En Tauri, el rendimiento es equivalente al navegador.
- [ ] No hay long tasks visibles en Performance al agregar productos.
- [ ] El build sigue pasando y el bundle no crece sin justificación.

### 13.3 Criterio de “listo”

- Ninguna animación supera 420 ms en el flujo de venta.
- Ninguna acción de negocio espera a que termine una animación.
- No hay animaciones en bucle en la pantalla de venta salvo un punto de estado.
- La experiencia se siente más clara, no más lenta.

---

## 14. Riesgos y decisiones pendientes

| Tema | Decisión pendiente |
|---|---|
| Aprobar dependencias | Confirmar `motion` y `@formkit/auto-animate`. |
| Salida de modales | Requiere refactor de llamadores; se propone dejar solo entrada en esta fase. |
| Overlay de éxito | Definir si se auto-cierra o requiere click. |
| Lottie | Aplazado; solo si diseño aporta un JSON pequeño y se carga bajo demanda. |
| AutoAnimate | Confirmar que se limita a carrito y líneas de pago. |
| Transición de página | Opcional; solo opacidad, nunca transform. |
| Count-up de métricas | Solo si se crea un componente cliente pequeño; no convertir páginas enteras. |
| Bundle | Medir después de instalar Motion; considerar `LazyMotion` si es necesario. |

---

## 15. Referencias

- Motion para React: https://motion.dev/docs/react
- AutoAnimate: https://auto-animate.formkit.com/
- Anime.js: https://animejs.com/
- Animate.css: https://animate.style/
- Lottie-web: https://github.com/airbnb/lottie-web
- `prefers-reduced-motion`: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion

---

## 16. Siguiente paso

Aprobar la selección **Motion + AutoAnimate** y ejecutar la Fase 0 y la Fase 1. No instalar Animate.css, Anime.js ni Lottie en esta iteración.

Si se aprueba, el primer cambio verificable debería ser: modal con entrada suave, toasts con salida animada y carrito con AutoAnimate, sin tocar todavía el flujo de pago.
