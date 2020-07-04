import { graphQLClient } from '../../lib'
import { Address, SearchAddressPayload } from './actions'

const buildQuery = (query: string) => `
{
    addressesSearch(query:"${query}") {
      _id,
      formattedAddress
   
    }
  }
  
  `

interface RespData {
  addressesSearch: Address[]
}

export const searchAddressAPI = async (
  payload: SearchAddressPayload
): Promise<Address[]> => {
  const data = await graphQLClient.request<RespData>(buildQuery(payload.input))
  return data.addressesSearch
}
