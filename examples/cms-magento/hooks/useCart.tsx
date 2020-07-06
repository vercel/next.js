import { useDispatch } from 'react-redux'
import Router from 'next/router'

import {
  ADD_TO_CART_QUERY,
  EMPTY_CUSTOMER_CART_QUERY,
  GET_CUSTOMER_CART_QUERY,
  EMPTY_GUEST_CART_QUERY,
  MERGE_CART_QUERY,
  REMOVE_ITEM_FROM_CART_QUERY,
  UPDATE_ITEM_FROM_CART_QUERY,
  APPLY_COUPON_QUERY,
  REMOVE_COUPON_QUERY,
  SET_PAYMENT_METHOD_QUERY,
  PLACE_ORDER_QUERY,
  SET_SHIPPING_METHOD_QUERY,
} from 'lib/graphql/cart'

import {
  setCartQuantity,
  setCustomercustomerId,
  setGuestcustomerId,
  setError,
  setLoading,
  setCartInfo,
  setIdToNull,
  setSuccess,
} from 'lib/redux/actions'
import useApolloQuery from './useApolloQuery'
import { IVariables } from 'interfaces/variable'

const useCart = () => {
  const dispatch = useDispatch()

  const { getApolloQuery, mutateApolloQuery } = useApolloQuery()

  // CUSTOMER EMPTY CART
  const createEmptyCartCustomer = async ({ guestId, token }: IVariables) => {
    const variables = { guestId, token }

    const { data } = await getApolloQuery(EMPTY_CUSTOMER_CART_QUERY, variables)

    /**
     * IF CART ID EXISTS
     * SET CUSTOMER CART ID IN REDUX STATE
     */
    if (!!data) dispatch(setCustomercustomerId(data.customerCart.id))

    /**
     * IF GUEST ID AND TOKEN IS PRESENT
     * MERGE CARTS
     * ELSE
     * GET CUSTOMER CART DETAILS
     */

    if (!!guestId && !!token) {
      mergeCarts({ customerId: data.customerCart.id, guestId, token })
    } else {
      await getCartInfo({ customerId: data.customerCart.id, token })
    }
  }

  // GUEST EMPTY CART
  const createEmptyCartGuest = async () => {
    const { data } = await mutateApolloQuery(EMPTY_GUEST_CART_QUERY, {})

    /**
     * IF CART ID EXISTS
     * SET GUEST CART ID IN REDUX STATE
     */
    if (!!data) dispatch(setGuestcustomerId(data.createEmptyCart))

    return {
      guestId: data.createEmptyCart,
    }
  }

  // MERGE CARTS
  const mergeCarts = async ({ customerId, guestId, token }: IVariables) => {
    const variables = {
      source_cart_id: guestId,
      destination_cart_id: customerId,
      token,
    }

    try {
      await mutateApolloQuery(MERGE_CART_QUERY, variables)
      await getCartInfo({ customerId, guestId, token })
    } catch (error) {
      console.log('error:merge', error.graphQLErrors[0].message)
    }
  }

  // ADD ITEM TO CART
  const addToCart = async (item: IVariables) => {
    const { customerId, guestId, token } = item

    dispatch(setLoading(true, item.sku))
    dispatch(setError('', item.sku))
    dispatch(setSuccess(false, item.sku))

    try {
      /**
       * IF CUSTOMER ID OR GUEST ID EXISTS
       * ADD PRODUCT TO CART
       * ELSE
       * CREATE GUEST CART ID
       * ADD PRODUCT TO CART
       */

      if (!!customerId || !!guestId) {
        await mutateApolloQuery(ADD_TO_CART_QUERY, item)
        await getCartInfo({ customerId, guestId, token })
      } else if (guestId === null) {
        const { guestId } = await createEmptyCartGuest()
        await mutateApolloQuery(ADD_TO_CART_QUERY, { ...item, guestId })
        await getCartInfo({ customerId, guestId, token })
      }

      dispatch(setError('', item.sku))
      dispatch(setLoading(false, item.sku))
      dispatch(setSuccess(true, item.sku))

      setTimeout(() => {
        dispatch(setSuccess(false, item.sku))
      }, 1000)
    } catch (error) {
      console.log(error.graphQLErrors[0].message)
      dispatch(setError(error.graphQLErrors[0].message, item.sku))
      dispatch(setLoading(false, item.sku))
    }
  }

  // REMOVE CART ITEMS
  const removeItemFromCart = async (item: IVariables) => {
    const { customerId, guestId, cart_item_id, token } = item

    dispatch(setLoading(true, cart_item_id))
    dispatch(setError('', cart_item_id))

    try {
      await mutateApolloQuery(REMOVE_ITEM_FROM_CART_QUERY, item)
      await getCartInfo({ customerId, guestId, token })

      dispatch(setLoading(false, cart_item_id))
      dispatch(setError('', cart_item_id))
    } catch (error) {
      dispatch(setError(error.graphQLErrors[0].message, cart_item_id))
      dispatch(setLoading(false, cart_item_id))
    }
  }

  // UDPATE CART ITEMS
  const updateCartItems = async (item: IVariables) => {
    const { customerId, guestId, cart_item_id, token } = item

    dispatch(setLoading(true, cart_item_id))
    dispatch(setError('', cart_item_id))

    try {
      await mutateApolloQuery(UPDATE_ITEM_FROM_CART_QUERY, item)
      await getCartInfo({ guestId, customerId, token })

      dispatch(setLoading(false, cart_item_id))
      dispatch(setError('', cart_item_id))
    } catch (error) {
      console.log('error:atc', error.graphQLErrors[0].message)
      dispatch(setError(error.graphQLErrors[0].message, cart_item_id))
      dispatch(setLoading(false, cart_item_id))
    }
  }

  // APPLY COUPON TO THE CART
  const applyCoupon = async ({
    customerId,
    guestId,
    coupon_code,
    token,
    fetchPolicy,
  }: IVariables) => {
    const variables = { guestId, customerId, coupon_code, token }

    dispatch(setLoading(true, 'coupon_code'))
    dispatch(setError('', 'coupon_code'))

    try {
      await mutateApolloQuery(APPLY_COUPON_QUERY, variables)
      await getCartInfo({ customerId, guestId, token, fetchPolicy })

      dispatch(setLoading(false, 'coupon_code'))
      dispatch(setError('', 'coupon_code'))
    } catch (error) {
      console.log('error:coupon', error)
      dispatch(setLoading(false, 'coupon_code'))
      dispatch(setError(error.graphQLErrors[0].message, 'coupon_code'))
    }
  }

  // REMOVE COUPON FROM THE CART
  const removeCoupon = async ({
    customerId,
    guestId,
    token,
    fetchPolicy,
  }: IVariables) => {
    const variables = { guestId, customerId, token }

    dispatch(setLoading(true, 'coupon_code'))
    dispatch(setError('', 'coupon_code'))

    try {
      await mutateApolloQuery(REMOVE_COUPON_QUERY, variables)
      await getCartInfo({ customerId, guestId, token, fetchPolicy })

      dispatch(setLoading(false, 'coupon_code'))
      dispatch(setError('', 'coupon_code'))
    } catch (error) {
      console.log('error:coupon', error)
      dispatch(setLoading(false, 'coupon_code'))
      dispatch(setError(error.graphQLErrors[0].message, 'coupon_code'))
    }
  }

  // GET CART INFO OF USER
  const getCartInfo = async ({
    customerId,
    guestId,
    token,
    fetchPolicy,
  }: IVariables) => {
    const variables = {
      customerId,
      guestId,
      token,
      fetchPolicy,
    }

    const { data } = await getApolloQuery(GET_CUSTOMER_CART_QUERY, variables)

    const cartQuantity = data.cart.total_quantity

    dispatch(setCartQuantity(cartQuantity))
    dispatch(setCartInfo(data.cart))
  }

  // SET SHIPMENT MODE
  const setShipmentMode = async (variables: IVariables) => {
    dispatch(setLoading(true, 'shipment'))
    dispatch(setError('', 'shipment'))

    try {
      await mutateApolloQuery(SET_SHIPPING_METHOD_QUERY, variables)

      dispatch(setLoading(false, 'shipment'))
      dispatch(setError('', 'shipment'))
    } catch (error) {
      console.log('error:payment', error)
      dispatch(setLoading(false, 'shipment'))
      dispatch(setError(error.graphQLErrors[0].message, 'shipment'))
    }
  }

  // SET PAYMENT MODE
  const setPaymentMode = async ({
    customerId,
    guestId,
    token,
    code,
  }: IVariables) => {
    const variables = { guestId, customerId, token, code }

    dispatch(setLoading(true, 'payment'))
    dispatch(setError('', 'payment'))

    try {
      await mutateApolloQuery(SET_PAYMENT_METHOD_QUERY, variables)

      dispatch(setLoading(false, 'payment'))
      dispatch(setError('', 'payment'))
    } catch (error) {
      console.log('error:payment', error)
      dispatch(setLoading(false, 'payment'))
      dispatch(setError(error.graphQLErrors[0].message, 'payment'))
    }
  }

  // PLACE ORDER
  const placeOrder = async (variables: IVariables) => {
    dispatch(setLoading(true, 'payment'))
    dispatch(setError('', 'payment'))

    try {
      const { data } = await mutateApolloQuery(PLACE_ORDER_QUERY, variables)

      const orderNo = data.placeOrder.order.order_number

      console.log('ORDER', orderNo)

      Router.push('/order/[success]', `/order/${orderNo}`)

      dispatch(setLoading(false, 'payment'))
      dispatch(setError('', 'payment'))
      dispatch(setIdToNull())
    } catch (error) {
      console.log('error:payment', error)
      dispatch(setLoading(false, 'payment'))
      dispatch(setError(error.graphQLErrors[0].message, 'payment'))
    }
  }

  return {
    addToCart,
    applyCoupon,
    createEmptyCartCustomer,
    createEmptyCartGuest,
    getCartInfo,
    placeOrder,
    removeItemFromCart,
    removeCoupon,
    setPaymentMode,
    setShipmentMode,
    updateCartItems,
  }
}

export default useCart
