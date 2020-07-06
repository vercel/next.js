import cookie from 'js-cookie'
import { useQuery } from '@apollo/react-hooks'
import { motion } from 'framer-motion'
import { NextPage } from 'next'

import Layout from 'components/Layout'

import { GET_CUSTOMER_CART_QUERY } from 'lib/graphql/cart'
import { useSelector } from 'react-redux'

import Loader from 'components/Loader'
import CartInfo from 'components/Cart'
import { IInitialState } from 'interfaces/state'

const container = {
  hidden: { opacity: 1, scale: 0 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      delay: 0.3,
      when: 'beforeChildren',
      staggerChildren: 0.1,
    },
  },
}

const CartPage: NextPage = () => {
  const { guestId, customerId, cart } = useSelector(
    (state: IInitialState) => state
  )

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

  return (
    <Layout>
      {loading ? (
        <Loader loading={loading} />
      ) : (
        <motion.div
          className="container"
          variants={container}
          initial="hidden"
          animate="visible"
        >
          <div className="row">
            <div className="col-12 col-md-offset-1">
              <CartInfo
                cartInfo={cart}
                customerId={customerId}
                guestId={guestId}
                token={token}
              />
            </div>
          </div>
        </motion.div>
      )}
    </Layout>
  )
}

export default CartPage
