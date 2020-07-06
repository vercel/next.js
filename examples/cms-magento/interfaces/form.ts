import { TAddress } from 'interfaces/address'
import { OnSubmit, NestDataObject, FieldError } from 'react-hook-form'
import { BaseSyntheticEvent } from 'react'

export interface ICheckoutForm {
  register: any
  handleSubmit: (
    callback: OnSubmit<TAddress>
  ) => (e?: BaseSyntheticEvent<object, any, any> | undefined) => Promise<void>
  errors: NestDataObject<TAddress, FieldError>
  onSubmit: (fields: TAddress) => Promise<void>
}
