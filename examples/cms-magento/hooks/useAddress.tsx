import { useDispatch } from 'react-redux'

import {
  SET_SHIPPING_ADDRESS_QUERY,
  SET_BILLING_ADDRESS_QUERY,
  SET_EMAIL_ON_CART,
} from 'lib/graphql/address'

import { TAddress, TEmail } from 'interfaces/address'
import { setLoading, setError } from 'lib/redux/actions'
import useApolloQuery from './useApolloQuery'

interface IProps extends TAddress {
  guestId: string
  customerId: string
  token?: string
}

const useAddress = () => {
  const dispatch = useDispatch()
  const { mutateApolloQuery } = useApolloQuery()

  const mutateShippingAddress = async (inputs: IProps) => {
    dispatch(setLoading(true, 'shipping'))
    dispatch(setError('', 'shipping'))

    const { address, address2, email, ...requiredFields } = inputs

    const variables = {
      ...requiredFields,
    }

    try {
      await mutateApolloQuery(SET_SHIPPING_ADDRESS_QUERY, variables)

      dispatch(setLoading(false, 'shipping'))
      dispatch(setError('', 'shipping'))
    } catch (error) {
      console.log('error:shipping', error.graphQLErrors[0].message)
      dispatch(setLoading(false, 'shipping'))
      dispatch(setError(error.graphQLErrors[0].message, 'shipping'))
    }
  }

  const mutateBillingAddress = async (inputs: IProps) => {
    const { address, address2, ...requiredFields } = inputs

    dispatch(setLoading(true, 'billing'))
    dispatch(setError('', 'billing'))

    const variables = {
      ...requiredFields,
    }

    try {
      await mutateApolloQuery(SET_BILLING_ADDRESS_QUERY, variables)

      dispatch(setLoading(false, 'billing'))
      dispatch(setError('', 'billing'))
    } catch (error) {
      console.log('error:billing', error.graphQLErrors[0].message)
      dispatch(setLoading(false, 'billing'))
      dispatch(setError(error.graphQLErrors[0].message, 'billing'))
    }
  }

  const setEmailOnCart = async (variables: TEmail) => {
    dispatch(setLoading(true, 'shipping'))
    dispatch(setError('', 'shipping'))

    try {
      await mutateApolloQuery(SET_EMAIL_ON_CART, variables)

      dispatch(setLoading(false, 'shipping'))
      dispatch(setError('', 'shipping'))
    } catch (error) {
      console.log('error:email', error.graphQLErrors[0].message)
      dispatch(setLoading(false, 'shipping'))
      dispatch(setError(error.graphQLErrors[0].message, 'shipping'))
    }
  }

  return {
    mutateShippingAddress,
    mutateBillingAddress,
    setEmailOnCart,
  }
}

export default useAddress
