import { useForm } from 'react-hook-form'
import { useSelector } from 'react-redux'
import cookie from 'js-cookie'

import useCart from 'hooks/useCart'

import { IInitialState } from 'interfaces/state'
import { IVariables } from 'interfaces/variable'

type Inputs = {
  coupon_code: string
}

const CouponForm = () => {
  const token = cookie.get('token')

  const { register, handleSubmit } = useForm<Inputs>()
  const { applyCoupon, removeCoupon } = useCart()

  const { guestId, customerId, loading, cart, id } = useSelector(
    (state: IInitialState) => state
  )

  const coupon = !!cart?.applied_coupons && cart?.applied_coupons[0].code

  const onSubmit = async ({ coupon_code }: Inputs) => {
    const variables: IVariables = {
      guestId,
      customerId,
      coupon_code,
      token,
      fetchPolicy: 'network-only',
    }
    await applyCoupon(variables)
  }

  const handleRemoveCoupon = async () => {
    const variables: IVariables = {
      guestId,
      customerId,
      token,
      fetchPolicy: 'network-only',
    }
    await removeCoupon(variables)
  }

  return (
    <>
      {coupon && (
        <div className="d-flex align-items-center justify-content-between my-4">
          <h6>Coupon Applied: {coupon}</h6>
          <button onClick={handleRemoveCoupon} className="btn btn-secondary">
            REMOVE
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="card p-2">
        <div className="input-group">
          <input
            type="text"
            className="form-control"
            placeholder="Promo code"
            name="coupon_code"
            ref={register}
          />
          <div className="input-group-append">
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={id === 'coupon_code' && loading}
            >
              Redeem
            </button>
          </div>
        </div>
      </form>
    </>
  )
}

export default CouponForm
