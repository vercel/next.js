export type TCustomerAddress = {
  city: string
  country_code: string
  firstname: string
  id: string
  lastname: string
  middlename: string
  postcode: string
  region: {
    region_code: string
    region: string
  }
  street: string
  telephone: string
}

export interface IProfile {
  created_at: string
  email: string
  firstname: string
  id: Number
  lastname: string
  addresses: [TCustomerAddress]
}
