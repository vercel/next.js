import { graphql, compose } from 'react-apollo'
import gql from 'graphql-tag'

const customerCreate = gql`
  mutation customerCreate($input: CustomerCreateInput!) {
    customerCreate(input: $input) {
      userErrors {
        field
        message
      }
      customer {
        id
      }
    }
  }
`;

const customerAccessTokenCreate = gql`
  mutation customerAccessTokenCreate($input: CustomerAccessTokenCreateInput!) {
    customerAccessTokenCreate(input: $input) {
      userErrors {
        field
        message
      }
      customerAccessToken {
        accessToken
        expiresAt
      }
    }
  }
`;

const withCustomerAuthMutation = compose(
  graphql(customerCreate, {name: "customerCreate"}),
  graphql(customerAccessTokenCreate, {name: "customerAccessTokenCreate"})
)

export default withCustomerAuthMutation
