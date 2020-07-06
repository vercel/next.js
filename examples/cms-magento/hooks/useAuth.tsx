import { useDispatch, useSelector } from 'react-redux'
import cookie from 'js-cookie'
import Router from 'next/router'

import { isLoggedIn, isLoggedOut } from 'lib/redux/actions'
import useCart from './useCart'

const useAuth = () => {
  const dispatch = useDispatch()
  const { guestId } = useSelector((state: { guestId: string }) => state)
  const { createEmptyCartCustomer } = useCart()

  const login = async (token: string) => {
    cookie.set('token', token, {
      expires: 60,
      secure: process.env.NODE_ENV === 'production',
    })

    /**
     * SET isAuthenticated TO TRUE IN REDUX STATE
     */
    dispatch(isLoggedIn())

    /**
     * CREATES CART ID FOR THE CUSTOMER
     */
    await createEmptyCartCustomer({ guestId, token })
  }

  const logout = () => {
    cookie.remove('token')

    /**
     * SET isAuthenticated TO FALSE IN REDUX STATE,
     * CUSTOMER ID TO NULL
     * QUANTITY TO NULL
     */
    dispatch(isLoggedOut())

    Router.push('/account/login')
  }

  return { login, logout }
}

export default useAuth
