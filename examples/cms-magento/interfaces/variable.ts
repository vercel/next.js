import { FetchPolicy } from 'apollo-client'

export interface IVariables {
  carrier_code?: string
  cartId?: string
  cart_item_id?: string
  code?: string
  coupon_code?: string
  customerId?: string | any
  fetchPolicy?: FetchPolicy
  guestId?: string | any
  isAuthenticated?: boolean
  method_code?: string
  quantity?: Number
  sku?: string | any
  token?: string
  id?: string
  error?: string
  loading?: boolean
}
