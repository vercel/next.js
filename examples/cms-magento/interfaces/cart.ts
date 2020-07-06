import { TPriceRange } from './product'

type CartItem = {
  name: string
  sku: string
  price_range: TPriceRange
  thumbnail: {
    url: string
  }
}

type CartItemPrice = {
  row_total_including_tax: {
    value: Number
  }
}

export type TCart = {
  id: string
  prices: CartItemPrice
  product: CartItem
  quantity: number
}

type TDiscount = {
  amount: {
    value: Number
  }
}

export type TCartTotal = {
  subtotal_including_tax: {
    value: string
  }
  discounts: [TDiscount]
  grand_total: {
    value: string
  }
}

export type TPaymentMethods = {
  code: string
  title: string
}

type TCoupon = {
  code: string
}

export interface ICart {
  items: [TCart]
  prices: TCartTotal
  total_quantity: Number
  applied_coupons: [TCoupon]
}
