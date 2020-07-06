import ActionTypes from './types'
import { initialState } from './state'
import { IInitialState } from 'interfaces/state'

export type TProduct = {
  sku?: string | any
  loading?: boolean | any
  error?: string | any
  success?: string | any
}

export interface Action {
  type: string
  payload: IInitialState
}

export default function reducer(
  state = initialState,
  { type, payload }: Action
) {
  switch (type) {
    case ActionTypes.LOADING:
      return {
        ...state,
        id: payload.id,
        loading: payload.loading,
      }

    case ActionTypes.ERROR:
      return {
        ...state,
        id: payload.id,
        error: payload.error,
      }

    case ActionTypes.SUCCESS:
      return {
        ...state,
        id: payload.id,
        success: payload.success,
      }

    case ActionTypes.LOGIN:
      return {
        ...state,
        ...payload,
        error: null,
        isAuthenticated: true,
      }

    case ActionTypes.LOGOUT:
      return {
        ...initialState,
      }

    case ActionTypes.CARTID:
    case ActionTypes.CARTINFO:
      return {
        ...state,
        ...payload,
      }

    case ActionTypes.ORDER_SUCCESS:
      return {
        ...state,
        ...payload,
        guestId: null,
        customerId: null,
        quantity: null,
        cart: {},
      }

    default:
      return state
  }
}
