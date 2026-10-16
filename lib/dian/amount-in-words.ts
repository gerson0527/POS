const LETRAS_U = [
  '', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE',
  'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS',
  'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE',
]
const LETRAS_D = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const LETRAS_C = ['', 'CIENTO', 'DOSCIENTOS', 'TRECIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS']

function letrasMenor(n: number): string {
  const c = Math.floor(n / 100)
  const r = n % 100
  let s = ''
  if (c > 0) s += (n === 100 ? 'CIEN' : LETRAS_C[c] + ' ')
  if (r > 0) {
    if (r < 30) s += LETRAS_U[r]
    else {
      const d = Math.floor(r / 10)
      const u = r % 10
      s += LETRAS_D[d] + (u ? ' Y ' + LETRAS_U[u] : '')
    }
  }
  return s.trim()
}

/** "11900" → "ONCE MIL NOVECIENTOS" (para la leyenda "SON: ... PESOS M/CTE"). */
export function numeroALetras(num: number): string {
  const n = Math.floor(Math.abs(Number(num) || 0))
  if (n === 0) return 'CERO'
  const partes: string[] = []
  const mill = Math.floor(n / 1000000)
  const mil = Math.floor((n % 1000000) / 1000)
  const men = n % 1000
  if (mill === 1) partes.push('UN MILLÓN')
  else if (mill > 1) partes.push(letrasMenor(mill) + ' MILLONES')
  if (mil === 1) partes.push('MIL')
  else if (mil > 1) partes.push(letrasMenor(mil) + ' MIL')
  if (men > 0) partes.push(letrasMenor(men))
  return partes.join(' ')
}
