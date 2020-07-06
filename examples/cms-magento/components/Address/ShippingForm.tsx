import { FC } from 'react'
import { useSelector } from 'react-redux'
import Router from 'next/router'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'

import { FormErrorMessage } from 'components/Message'

import { TAddress } from 'interfaces/address'
import { IInitialState } from 'interfaces/state'

import useAddress from 'hooks/useAddress'
import { IVariables } from 'interfaces/variable'

interface Props {
  shippingStatesByCountry: any
  state: IVariables
}

const ShippingForm: FC<Props> = ({
  shippingStatesByCountry,
  state: { token, guestId, customerId, isAuthenticated },
}) => {
  const { loading, id } = useSelector((state: IInitialState) => state)
  const { mutateShippingAddress, setEmailOnCart } = useAddress()
  const { register, handleSubmit, errors } = useForm<TAddress>()

  const onSubmit = async (fields: TAddress) => {
    let street = fields.address + ' ' + fields.address2
    let email = fields.email
    let inputs = {
      ...fields,
      street,
      token,
      guestId,
      customerId,
    }

    isAuthenticated === false && (await setEmailOnCart({ email, guestId }))
    await mutateShippingAddress(inputs)

    Router.push('/checkout/[step]', '/checkout/payment').then(() =>
      window.scrollTo(0, 0)
    )
  }

  const country = shippingStatesByCountry.full_name_english
  const countryCode = shippingStatesByCountry.id
  const available_regions = shippingStatesByCountry.available_regions

  return (
    <div className="col-md-8 order-md-1">
      <h4 className="mb-3">Shipping address</h4>
      <form
        key={1}
        className="needs-validation"
        onSubmit={handleSubmit(onSubmit)}
      >
        {isAuthenticated === false && (
          <div className="mb-3">
            <label htmlFor="email">Email</label>
            <input
              type="text"
              className="form-control"
              id="email"
              name="email"
              ref={register({
                required: 'Please enter your Email Address',
              })}
            />
            <FormErrorMessage name="email" errors={errors} />
          </div>
        )}
        <div className="row">
          <div className="col-md-6 mb-3">
            <label htmlFor="firstname">First name</label>
            <input
              type="text"
              className="form-control"
              id="firstname"
              name="firstname"
              ref={register({ required: 'Please enter your first name' })}
            />
            <FormErrorMessage name="firstname" errors={errors} />
          </div>
          <div className="col-md-6 mb-3">
            <label htmlFor="lastname">Last name</label>
            <input
              type="text"
              className="form-control"
              id="lastname"
              name="lastname"
              ref={register({ required: 'Please enter your last name' })}
            />
            <FormErrorMessage name="lastname" errors={errors} />
          </div>
        </div>

        <div className="mb-3">
          <label htmlFor="telephone">Phone Number</label>
          <input
            type="text"
            className="form-control"
            id="telephone"
            name="telephone"
            placeholder="1234567890"
            ref={register({ required: 'Please enter your Phone Number' })}
          />
          <FormErrorMessage name="telephone" errors={errors} />
        </div>

        <div className="mb-3">
          <label htmlFor="address">Address</label>
          <input
            type="text"
            className="form-control"
            id="address"
            name="address"
            placeholder="1234 Main St"
            ref={register({
              required: 'Please enter your shipping address',
            })}
          />
          <FormErrorMessage name="address" errors={errors} />
        </div>
        <div className="mb-3">
          <label htmlFor="address2">Address 2</label>
          <input
            type="text"
            className="form-control"
            id="address2"
            name="address2"
            placeholder="Apartment or suite"
            ref={register}
          />
        </div>
        <div className="row">
          <div className="col-md-3 mb-3">
            <label htmlFor="country_code">Country</label>
            <select
              className="custom-select d-block w-100"
              id="country_code"
              name="country_code"
              ref={register}
            >
              <option value={countryCode}>{country}</option>
            </select>
          </div>
          <div className="col-md-3 mb-3">
            <label htmlFor="region">Region</label>
            <select
              className="custom-select d-block w-100"
              id="region"
              name="region"
              ref={register}
            >
              {available_regions &&
                available_regions.map((region: any) => (
                  <option key={region.code} value={region.code}>
                    {region.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="col-md-3 mb-3">
            <label htmlFor="zip">City</label>
            <input
              type="text"
              className="form-control"
              id="city"
              name="city"
              ref={register({ required: 'Please enter your city' })}
            />
            <FormErrorMessage name="city" errors={errors} />
          </div>
          <div className="col-md-3 mb-3">
            <label htmlFor="postcode">Postcode</label>
            <input
              type="text"
              className="form-control"
              id="postcode"
              name="postcode"
              ref={register({ required: 'Please enter your pincode' })}
            />
            <FormErrorMessage name="postcode" errors={errors} />
          </div>
        </div>
        <hr className="mb-4" />

        <div className="custom-control custom-checkbox">
          <input
            type="checkbox"
            className="custom-control-input"
            defaultChecked
            name="save_in_address_book"
            id="save_in_address_book"
            ref={register}
          />
          <label
            className="custom-control-label"
            htmlFor="save_in_address_book"
          >
            Save this information for next time
          </label>
        </div>

        <hr className="mb-4" />
        <motion.button
          whileHover={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          className="btn btn-primary  btn-block"
          type="submit"
          disabled={id === 'shipping' && loading}
        >
          Continue
        </motion.button>
      </form>
    </div>
  )
}

export default ShippingForm
