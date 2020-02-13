import React from 'react'
import { formatAmountForDisplay } from '../utils/stripe-helpers'

type Props = {
  name: string
  value: number
  min: number
  max: number
  currency: string
  step: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
}

const CustomDonationInput: React.FunctionComponent<Props> = ({
  name,
  value,
  min,
  max,
  currency,
  step,
  onChange,
}) => (
  <label>
    Custom donation amount ({formatAmountForDisplay(min, currency)}-
    {formatAmountForDisplay(max, currency)}):
    <input
      type="number"
      name={name}
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
    ></input>
  </label>
)

export default CustomDonationInput
