export interface LocationItem {
  id: string
  name: string
  code: string
  address: string | null
  phone: string | null
  status: string
  createdAt: Date
}

export interface NumerationItem {
  id: string
  resolution: string
  prefix: string
  startRange: number
  endRange: number
  currentNumber: number
  documentType: string
  status: string
  createdAt: Date
}
