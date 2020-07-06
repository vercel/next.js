import { TProduct } from '../lib/redux/reducers'
import { ICart } from './cart'

export interface IInitialState extends TProduct {
  isAuthenticated?: boolean | any
  customerId?: string | any
  guestId?: string | any
  quantity?: Number | any
  cart?: ICart
  id?: string | any
  success?: string | boolean | any
}
