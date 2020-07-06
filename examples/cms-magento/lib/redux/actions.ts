import { ICart } from '../../interfaces/cart'
import ActionTypes from './types'
import { Action } from './reducers'
import { toast } from 'react-toastify'

// SET IS AUTHENTICATED TO TRUE
export const isLoggedIn = () => ({ type: ActionTypes.LOGIN })

// SET IS AUTHENTICATED TO FALSE
export const isLoggedOut = () => ({ type: ActionTypes.LOGOUT })

// SET ERROR MESSAGE
export const setError = (error?: string, id?: string) => (
  dispatch: (action: Action) => any
) => {
  error &&
    toast.error(error, {
      position: toast.POSITION.BOTTOM_RIGHT,
      autoClose: 5000,
    })
  return dispatch({
    type: ActionTypes.ERROR,
    payload: {
      id,
      error,
    },
  })
}

// SET SUCCESS MESSAGE
export const setSuccess = (success?: string | boolean, id?: string) => (
  dispatch: (action: Action) => any
) => {
  success &&
    toast.success(success, {
      position: toast.POSITION.BOTTOM_RIGHT,
      autoClose: 5000,
    })
  return dispatch({
    type: ActionTypes.SUCCESS,
    payload: {
      id,
      success,
    },
  })
}

// SET LOADING
export const setLoading = (loading?: boolean, id?: string) => (
  dispatch: (action: Action) => any
) =>
  dispatch({
    type: ActionTypes.LOADING,
    payload: {
      id,
      loading,
    },
  })

// SET GUEST CART ID
export const setGuestcustomerId = (guestId: string) => (
  dispatch: (action: Action) => any
) =>
  dispatch({
    type: ActionTypes.CARTID,
    payload: {
      guestId,
      customerId: null,
    },
  })

// SET CUSTOMER CART ID
export const setCustomercustomerId = (customerId: string) => (
  dispatch: (action: Action) => any
) =>
  dispatch({
    type: ActionTypes.CARTID,
    payload: {
      customerId,
      guestId: null,
    },
  })

// SET CUSTOMER CART ID
export const setCartQuantity = (quantity: Number) => (
  dispatch: (action: Action) => any
) =>
  dispatch({
    type: ActionTypes.CARTID,
    payload: {
      quantity,
    },
  })

// SET CART DETAILS
export const setCartInfo = (cart: ICart) => (
  dispatch: (action: Action) => any
) =>
  dispatch({
    type: ActionTypes.CARTINFO,
    payload: {
      cart,
    },
  })

// SET CUSTOMER AND GUEST CART ID TO NULL
export const setIdToNull = () => ({ type: ActionTypes.ORDER_SUCCESS })
