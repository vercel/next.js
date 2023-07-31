import React from 'react'
import { formatAmountForDisplay } from '../utils/stripe-helpers'

type Props = {
  name: string
  min: number
  max: number
  currency: string
  step: number
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  value: number
  className?: string
}

const CustomDonationInput = ({
  name,
  min,
  max,
  currency,
  step,
  onChange,
  value,
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
      value={value}
    ></input>
  </label>
)

export default CustomDonationInput
