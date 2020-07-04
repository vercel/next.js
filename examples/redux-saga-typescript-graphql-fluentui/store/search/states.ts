import { Address } from './actions'

export interface SearchAddressState {
  input?: string
  addresses?: Address[]
  loading: boolean
  error?: Error
}
export const SearchAddressInitialState: SearchAddressState = {
  addresses: [],
  loading: false,
  input: '',
}
