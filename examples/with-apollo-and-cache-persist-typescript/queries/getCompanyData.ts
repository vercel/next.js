import gql from 'graphql-tag'

export const GET_COMPANY_DATA_QUERY = gql`
  query getCompanyData {
    company {
      name
      summary
    }
  }
`
