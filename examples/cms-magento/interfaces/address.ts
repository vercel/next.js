export type TEmail = {
  email: string
  guestId: string
}

export type TAddress = {
  email: string
  firstname: string
  lastname: string
  address: string
  address2: string
  country_code: string
  postcode: Number
  city: string
  state: string
  same_as_shipping: boolean
  save_in_address_book: boolean
}

export interface IAddress {
  adddress: TAddress
}
