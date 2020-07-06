import cookie from 'js-cookie'
import { useRouter } from 'next/router'
import { useQuery } from '@apollo/react-hooks'
import { useSelector } from 'react-redux'
import FadeIn from 'react-fade-in'

import Layout from 'components/Layout'
import ShippingForm from 'components/Address/ShippingForm'
import Loader from 'components/Loader'
import OrderSummary from 'components/Address/OrderSummary'
import BillingForm from 'components/Address/BillingForm'
import PaymentMethod from 'components/Address/PaymentMethod'

import { STATE_LIST_QUERY } from 'lib/graphql/address'
import { GET_CUSTOMER_CART_QUERY } from 'lib/graphql/cart'
import { IInitialState } from 'interfaces/state'

const Address = () => {
  const router = useRouter()

  const {
    guestId,
    customerId,
    cart,
    isAuthenticated,
    id,
    error,
    loading: payment,
  } = useSelector((state: IInitialState) => state)

  const cartId = !!customerId ? customerId : guestId

  const token = cookie.get('token')

  const { loading } = useQuery(GET_CUSTOMER_CART_QUERY, {
    variables: { cartId },
    fetchPolicy: 'cache-and-network',
    context: {
      headers: {
        authorization: token ? `Bearer ${token}` : '',
      },
    },
    notifyOnNetworkStatusChange: true,
  })

  const { data: shippingStates } = useQuery(STATE_LIST_QUERY, {
    fetchPolicy: 'cache-and-network',
    variables: { id: 'IN' },
    notifyOnNetworkStatusChange: true,
  })

  const initState = {
    token,
    guestId,
    customerId,
    cartId,
    isAuthenticated,
  }

  const shippingStatesByCountry = !!shippingStates && shippingStates.country

  return (
    <Layout>
      {loading ? (
        <Loader loading={loading} />
      ) : (
        <FadeIn>
          <div className="container">
            <div className="row mt-5">
              {!!cart && cart.items && (
                <>
                  <OrderSummary {...cart} />
                  {router.query.step === 'shipping' && (
                    <ShippingForm
                      shippingStatesByCountry={shippingStatesByCountry}
                      state={initState}
                    />
                  )}
                  {router.query.step === 'billing' && (
                    <BillingForm
                      shippingStatesByCountry={shippingStatesByCountry}
                      state={initState}
                    />
                  )}
                  {router.query.step === 'payment' && (
                    <PaymentMethod
                      state={{
                        ...initState,
                        loading: payment,
                        id,
                        error,
                      }}
                    />
                  )}
                </>
              )}
            </div>
            <footer className="my-5 pt-5 text-muted text-center text-small">
              <p className="mb-1">© 2020-2022 Discover Pilgrim</p>
              <ul className="list-inline">
                <li className="list-inline-item">
                  <a href="#">Privacy</a>
                </li>
                <li className="list-inline-item">
                  <a href="#">Terms</a>
                </li>
                <li className="list-inline-item">
                  <a href="#">Support</a>
                </li>
              </ul>
            </footer>
          </div>
        </FadeIn>
      )}
    </Layout>
  )
}

export default Address
