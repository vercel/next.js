import React from 'react'
import { formatAmountForDisplay } from '../utils/stripe-helpers'

type Props = {
  name: string
  min: number
  max: number
  currency: string
  step: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  className?: string
}

const CustomDonationInput = ({
  name,
  min,
  max,
  currency,
  step,
  onChange,
  className
}: Props) => (
  <label>
    Custom donation amount ({formatAmountForDisplay(min, currency)}-
    {formatAmountForDisplay(max, currency)}):
    <input
      type="range"
      name={name}
      min={min}
      max={max}
      step={step}
      onChange={onChange}
    ></input>
  </label>
)

export default CustomDonationInput
