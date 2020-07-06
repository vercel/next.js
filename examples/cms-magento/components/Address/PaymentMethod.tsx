import { useForm } from 'react-hook-form'
import { useQuery } from '@apollo/react-hooks'
import { motion } from 'framer-motion'
import Router from 'next/router'

import { FormErrorMessage } from 'components/Message'
import Loader from 'components/Loader'

import { GET_PAYMENT_SHIPPING_ADDRESS_QUERY } from 'lib/graphql/cart'
import useAddress from 'hooks/useAddress'
import useCart from 'hooks/useCart'
import { FC } from 'react'
import { IVariables } from 'interfaces/variable'

type Inputs = {
  payment_mode: string
  shipment_mode: string
}

interface Props {
  state: IVariables
}

const PaymentMethod: FC<Props> = ({
  state: { token, guestId, customerId, id, loading: payment },
}) => {
  const { mutateBillingAddress } = useAddress()
  const { setPaymentMode, placeOrder, setShipmentMode } = useCart()

  const { register, handleSubmit, errors } = useForm<Inputs>()

  const cartId = !!customerId ? customerId : guestId

  const { data: methodsAndAddress, loading } = useQuery(
    GET_PAYMENT_SHIPPING_ADDRESS_QUERY,
    {
      variables: { cartId },
      fetchPolicy: 'cache-and-network',
      context: {
        headers: {
          authorization: token ? `Bearer ${token}` : '',
        },
      },
      notifyOnNetworkStatusChange: true,
    }
  )

  const shippingMethod =
    methodsAndAddress &&
    methodsAndAddress.cart.shipping_addresses[0].available_shipping_methods

  const paymentMethod =
    methodsAndAddress && methodsAndAddress.cart.available_payment_methods

  const onSubmit = async (fields: Inputs) => {
    const {
      country,
      region: state,
      street: area,
      ...shippingAddress
    } = methodsAndAddress.cart.shipping_addresses[0]
    const street = area[0]
    const region = state.code
    const country_code = country.code
    const same_as_shipping = true

    const billingVariables = {
      ...shippingAddress,
      street,
      region,
      country_code,
      same_as_shipping,
      guestId,
      token,
      customerId,
      save_in_address_book: true,
    }

    const { carrier_code, method_code } = JSON.parse(fields.shipment_mode)

    const shippingVariables = {
      guestId,
      customerId,
      token,
      carrier_code,
      method_code,
    }

    const paymentVariables = {
      guestId,
      customerId,
      token,
      code: fields.payment_mode,
    }

    console.log('billing', billingVariables)
    console.log('shipment', shippingVariables)
    console.log('payment', paymentVariables)

    await mutateBillingAddress(billingVariables)
    await setShipmentMode(shippingVariables)
    await setPaymentMode(paymentVariables)
    await placeOrder({ guestId, customerId, token })
  }

  return (
    <div className="col-md-8 order-md-1">
      {loading ? (
        <Loader loading={loading} />
      ) : (
        <>
          <h4 className="mb-3">Billing address</h4>

          <div className="custom-control custom-checkbox">
            <input
              type="checkbox"
              defaultChecked={true}
              onChange={() => {
                Router.push('/checkout/[step]', '/checkout/billing').then(() =>
                  window.scrollTo(0, 0)
                )
              }}
              className="custom-control-input"
              id="same_as_shipping"
              name="same_as_shipping"
            />
            <label className="custom-control-label" htmlFor="same_as_shipping">
              Shipping address is the same as my billing address
            </label>
          </div>

          <hr className="mb-4" />
          <form onSubmit={handleSubmit(onSubmit)}>
            <h4 className="mb-3">Shipping Method</h4>

            {shippingMethod.map(
              (method: any, i: string | number | undefined) => (
                <div key={i} className="form-group col-6">
                  <div className="custom-control custom-radio">
                    <input
                      type="radio"
                      id={method.carrier_code}
                      value={`${JSON.stringify(method)}`}
                      name="shipment_mode"
                      className="custom-control-input"
                      ref={register({
                        required: 'Please select mode of shipment',
                      })}
                    />
                    <label
                      className="custom-control-label"
                      htmlFor={method.carrier_code}
                    >
                      {method.carrier_title}
                    </label>
                  </div>
                </div>
              )
            )}
            <FormErrorMessage name="shipment_mode" errors={errors} />

            <hr className="mb-4" />

            <h4 className="mb-3">Payment Method</h4>

            {paymentMethod.map(
              (
                method: {
                  code: string
                  title: string
                },
                i: string | number | undefined
              ) => (
                <div key={i} className="form-group col-6">
                  <div className="custom-control custom-radio">
                    <input
                      type="radio"
                      id={method.code}
                      value={method.code}
                      name="payment_mode"
                      className="custom-control-input"
                      ref={register({
                        required: 'Please select mode of payment',
                      })}
                    />
                    <label
                      className="custom-control-label"
                      htmlFor={method.code}
                    >
                      {method.title}
                    </label>
                  </div>
                </div>
              )
            )}
            <FormErrorMessage name="payment_mode" errors={errors} />
            <hr className="mb-4" />

            <motion.button
              whileHover={{ scale: 1 }}
              whileTap={{ scale: 0.9 }}
              type="submit"
              disabled={
                (id === 'billing' || 'shipment' || 'payment') && payment
              }
              className="btn btn-success btn-block"
            >
              Place Order <span className="glyphicon glyphicon-play" />
            </motion.button>
          </form>
        </>
      )}
    </div>
  )
}

export default PaymentMethod
