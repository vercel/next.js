import { gql } from 'apollo-boost'

const getUsdExchangeRate = gql`
  {
    rates(currency: "USD") {
      currency
      rate
    }
  }
`
export { getUsdExchangeRate }
