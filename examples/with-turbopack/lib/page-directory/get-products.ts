import { promises as fs } from 'fs'
import path from 'path'

export const getProducts = async () => {
  // We'd normally get data from an external data source
  return JSON.parse(
    await fs.readFile(
      path.join(process.cwd(), 'lib/page-directory') + '/products.json',
      'utf8'
    )
  ) as SingleProduct[]
}

const getReviews = async () => {
  return JSON.parse(
    await fs.readFile(
      path.join(process.cwd(), 'lib/page-directory') + '/reviews.json',
      'utf8'
    )
  ) as IReview[]
}

export const getProduct = async (id: string) => {
  const products = await getProducts()
  const reviews = await getReviews()

  const product = products.find((product) => product.id === id) as SingleProduct

  return {
    product,
    reviews,
    similarProducts: products.filter((product) => product.id !== id),
  }
}

export type IProduct = {
  id: string
  image?: string
  imageBlur?: string
  stock: number
  rating: number
  name: string
  price: Price
  isBestSeller: boolean
  leadTime: number
  discount?: Discount
  usedPrice?: UsedPrice
  description: string
}

export type Price = {
  amount: number
  currency: Currency
  scale: number
}

export type Currency = {
  code: string
  base: number
  exponent: number
}

export type Discount = {
  percent: number
  expires?: number
}

export type UsedPrice = {
  amount: number
  currency: Currency
  scale: number
}

export type IReview = {
  id: string
  name: string
  rating: number
  text: string
}

export type SingleProduct = IProduct & {
  reviews: IReview[]
  similarProducts: IProduct[]
}

export type GetProduct = Awaited<ReturnType<typeof getProduct>>
