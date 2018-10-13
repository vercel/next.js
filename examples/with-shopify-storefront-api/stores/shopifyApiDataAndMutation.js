import gql from 'graphql-tag';
import { graphql, compose } from 'react-apollo';
import {
  createCheckout,
  checkoutLineItemsAdd,
  checkoutLineItemsUpdate,
  checkoutLineItemsRemove,
  checkoutCustomerAssociate,
} from './shopifyCheckoutApi';

const query = gql`
query query {
  shop {
    name
    description
    products(first:20) {
      pageInfo {
        hasNextPage
        hasPreviousPage
      }
      edges {
        node {
          id
          title
          options {
            id
            name
            values
          }
          variants(first: 250) {
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
            edges {
              node {
                id
                title
                selectedOptions {
                  name
                  value
                }
                image {
                  src
                }
                price
              }
            }
          }
          images(first: 250) {
            pageInfo {
              hasNextPage
              hasPreviousPage
            }
            edges {
              node {
                src
              }
            }
          }
        }
      }
    }
  }
}
`

const withShopifyApiDataAndMutation = compose(
  graphql(query),
  graphql(createCheckout, {name: "createCheckout"}),
  graphql(checkoutLineItemsAdd, {name: "checkoutLineItemsAdd"}),
  graphql(checkoutLineItemsUpdate, {name: "checkoutLineItemsUpdate"}),
  graphql(checkoutLineItemsRemove, {name: "checkoutLineItemsRemove"}),
  graphql(checkoutCustomerAssociate, {name: "checkoutCustomerAssociate"})
);

export default withShopifyApiDataAndMutation
