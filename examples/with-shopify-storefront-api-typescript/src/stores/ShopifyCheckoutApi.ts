import gql from "graphql-tag";
import { compose, graphql } from "react-apollo";

const CheckoutFragment = gql`
  fragment CheckoutFragment on Checkout {
    id
    webUrl
    totalTax
    subtotalPrice
    totalPrice
    lineItems (first: 250) {
      edges {
        node {
          id
          title
          variant {
            id
            title
            image {
              src
            }
            price
          }
          quantity
        }
      }
    }
  }
`;

const createCheckout = gql`
  mutation checkoutCreate ($input: CheckoutCreateInput!){
    checkoutCreate(input: $input) {
      userErrors {
        message
        field
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }
  ${CheckoutFragment}
`;

const checkoutLineItemsAdd = gql`
  mutation checkoutLineItemsAdd ($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
    checkoutLineItemsAdd(checkoutId: $checkoutId, lineItems: $lineItems) {
      userErrors {
        message
        field
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }
  ${CheckoutFragment}
`;

const checkoutLineItemsUpdate = gql`
  mutation checkoutLineItemsUpdate ($checkoutId: ID!, $lineItems: [CheckoutLineItemUpdateInput!]!) {
    checkoutLineItemsUpdate(checkoutId: $checkoutId, lineItems: $lineItems) {
      userErrors {
        message
        field
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }
  ${CheckoutFragment}
`;

const checkoutLineItemsRemove = gql`
  mutation checkoutLineItemsRemove ($checkoutId: ID!, $lineItemIds: [ID!]!) {
    checkoutLineItemsRemove(checkoutId: $checkoutId, lineItemIds: $lineItemIds) {
      userErrors {
        message
        field
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }
  ${CheckoutFragment}
`;

const checkoutCustomerAssociate = gql`
  mutation checkoutCustomerAssociate($checkoutId: ID!, $customerAccessToken: String!) {
    checkoutCustomerAssociate(checkoutId: $checkoutId, customerAccessToken: $customerAccessToken) {
      userErrors {
        field
        message
      }
      checkout {
        ...CheckoutFragment
      }
    }
  }
  ${CheckoutFragment}
`;

const addVariantToCart = (that, variantId, quantity) => {
  that.props.checkoutLineItemsAdd({
    variables: {
      checkoutId: that.state.checkout.id,
      lineItems: [{
        quantity: parseInt(quantity, 10),
        variantId,
      }],
    },
  }).then((res) => {
    that.setState({
      checkout: res.data.checkoutLineItemsAdd.checkout,
    });
  });
  that.handleCartOpen();
};

const updateLineItemInCart = (that, lineItemId, quantity) => {
  that.props.checkoutLineItemsUpdate({
    variables: {
      checkoutId: that.state.checkout.id,
      lineItems: [{
        id: lineItemId,
        quantity: parseInt(quantity, 10),
      }],
    },
  }).then((res) => {
    that.setState({
      checkout: res.data.checkoutLineItemsUpdate.checkout,
    });
  });
};

const removeLineItemInCart = (that, lineItemId) => {
  that.props.checkoutLineItemsRemove({
    variables: {
      checkoutId: that.state.checkout.id,
      lineItemIds: [lineItemId],
    },
  }).then((res) => {
    that.setState({
      checkout: res.data.checkoutLineItemsRemove.checkout,
    });
  });
};

const associateCustomerCheckout = (that, customerAccessToken) => {
  that.props.checkoutCustomerAssociate({
    variables: {
      checkoutId: that.state.checkout.id,
      customerAccessToken,
    },
  }).then((res) => {
    that.setState({
      checkout: res.data.checkoutCustomerAssociate.checkout,
      isCustomerAuthOpen: false,
    });
  });
};

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
`;

const withShopifyApiDataAndMutation = compose(
  graphql(query),
  graphql(createCheckout, { name: "createCheckout" }),
  graphql(checkoutLineItemsAdd, { name: "checkoutLineItemsAdd" }),
  graphql(checkoutLineItemsUpdate, { name: "checkoutLineItemsUpdate" }),
  graphql(checkoutLineItemsRemove, { name: "checkoutLineItemsRemove" }),
  graphql(checkoutCustomerAssociate, { name: "checkoutCustomerAssociate" }),
);

export {
  addVariantToCart,
  associateCustomerCheckout,
  checkoutCustomerAssociate,
  checkoutLineItemsAdd,
  checkoutLineItemsRemove,
  checkoutLineItemsUpdate,
  createCheckout,
  removeLineItemInCart,
  updateLineItemInCart,
  withShopifyApiDataAndMutation,
};
