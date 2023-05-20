export type Product = {
  id: string
  stock: number
  rating: number
  name: string
  description: string
  price: Price
  isBestSeller: boolean
  leadTime: number
  image?: string
  imageBlur?: string
  discount?: Discount
  usedPrice?: UsedPrice
}

type Price = {
  amount: number
  currency: Currency
  scale: number
}

type Currency = {
  code: string
  base: number
  exponent: number
}

type Discount = {
  percent: number
  expires?: number
}

type UsedPrice = {
  amount: number
  currency: Currency
  scale: number
}
