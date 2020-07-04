import actionCreatorFactory from 'typescript-fsa'

const actionCreator = actionCreatorFactory('ADDRESS')

export interface SearchAddressPayload {
  input: string
}

export interface Address {
  _id: string
  formattedAddress: string
}

export interface SearchAddressSuccessPayload {
  addresses: Address[]
}

export interface SearchAddressFailurePayload {
  error: Error
}

export const SearchAddressActions = {
  clearAddress: actionCreator('CLEAR_ADDRESS'),
  searchAddress: actionCreator<SearchAddressPayload>('SEARCH_ADDRESS'),
  searchAddressSuccess: actionCreator<SearchAddressSuccessPayload>(
    'SEARCH_ADDRESS_SUCCESS'
  ),
  searchAddressFailure: actionCreator<SearchAddressFailurePayload>(
    'SEARCH_ADDRESS_FAILURE'
  ),
}

export type SearchAddressActionTypes =
  | ReturnType<typeof SearchAddressActions.clearAddress>
  | ReturnType<typeof SearchAddressActions.searchAddress>
  | ReturnType<typeof SearchAddressActions.searchAddressSuccess>
  | ReturnType<typeof SearchAddressActions.searchAddressFailure>
