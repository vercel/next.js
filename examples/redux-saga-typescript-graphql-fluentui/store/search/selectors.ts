import { RootState } from '../reducers'
import { SearchAddressState } from './states'

export const searchAddressSelector = (state: RootState): SearchAddressState =>
  state.searchAddress
