import gql from "graphql-tag";
import { compose, graphql } from "react-apollo";

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
  graphql(customerCreate, { name: "customerCreate" }),
  graphql(customerAccessTokenCreate, { name: "customerAccessTokenCreate" }),
);

export { withCustomerAuthMutation };
