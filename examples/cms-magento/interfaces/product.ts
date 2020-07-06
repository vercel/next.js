export type TPriceRange = {
  maximum_price: {
    final_price: {
      value: Number
    }
  }
}

export interface IProduct {
  id: number
  name: string
  sku: string
  quantity: string
  stock_status: string
  image: {
    url: string
  }
  price_range: TPriceRange
}
