import gql from 'graphql-tag'
import { SHIPPING_ADDRESS_FIELDS, AVAILABLE_PAYMENT_FIELDS } from './address'

export const CART_FIELDS = gql`
  fragment cartFields on Cart {
    id
    items {
      id
      product {
        name
        thumbnail {
          url
        }
        price_range {
          maximum_price {
            final_price {
              value
            }
          }
        }
      }
      quantity
      prices {
        row_total_including_tax {
          value
        }
      }
    }
    prices {
      subtotal_including_tax {
        value
      }
      discounts {
        amount {
          value
        }
      }
      grand_total {
        value
      }
    }
    applied_coupons {
      code
    }
    total_quantity
  }
`

export const EMPTY_GUEST_CART_QUERY = gql`
  mutation customerCart {
    createEmptyCart
  }
`

export const EMPTY_CUSTOMER_CART_QUERY = gql`
  query customerCart {
    customerCart {
      id
    }
  }
`

export const GET_CUSTOMER_CART_QUERY = gql`
  query customerCart($cartId: String!) {
    cart(cart_id: $cartId) {
      ...cartFields
      shipping_addresses {
        selected_shipping_method {
          carrier_code
          method_code
          carrier_title
          method_title
        }
      }
    }
  }
  ${CART_FIELDS}
`

export const ADD_TO_CART_QUERY = gql`
  mutation addSimpleProductsToCart(
    $cartId: String!
    $quantity: Float!
    $sku: String!
  ) {
    addSimpleProductsToCart(
      input: {
        cart_id: $cartId
        cart_items: [{ data: { quantity: $quantity, sku: $sku } }]
      }
    ) {
      cart {
        ...cartFields
      }
    }
  }
  ${CART_FIELDS}
`

export const REMOVE_ITEM_FROM_CART_QUERY = gql`
  mutation removeItemFromCart($cartId: String!, $cart_item_id: Int!) {
    removeItemFromCart(
      input: { cart_id: $cartId, cart_item_id: $cart_item_id }
    ) {
      cart {
        ...cartFields
      }
    }
  }
  ${CART_FIELDS}
`

export const UPDATE_ITEM_FROM_CART_QUERY = gql`
  mutation updateCartItems(
    $cartId: String!
    $cart_item_id: Int!
    $quantity: Float!
  ) {
    updateCartItems(
      input: {
        cart_id: $cartId
        cart_items: { quantity: $quantity, cart_item_id: $cart_item_id }
      }
    ) {
      cart {
        ...cartFields
      }
    }
  }
  ${CART_FIELDS}
`

export const MERGE_CART_QUERY = gql`
  mutation mergeCarts($source_cart_id: String!, $destination_cart_id: String!) {
    mergeCarts(
      source_cart_id: $source_cart_id
      destination_cart_id: $destination_cart_id
    ) {
      ...cartFields
    }
  }
  ${CART_FIELDS}
`

export const GET_PAYMENT_SHIPPING_ADDRESS_QUERY = gql`
  query getPaymentShippingAddress($cartId: String!) {
    cart(cart_id: $cartId) {
      id
      ...shippingAddressFields
      ...availablePaymentMethodsFields
    }
  }
  ${SHIPPING_ADDRESS_FIELDS}
  ${AVAILABLE_PAYMENT_FIELDS}
`

export const APPLY_COUPON_QUERY = gql`
  mutation applyCouponToCart($cartId: String!, $coupon_code: String!) {
    applyCouponToCart(input: { cart_id: $cartId, coupon_code: $coupon_code }) {
      cart {
        applied_coupons {
          code
        }
      }
    }
  }
`

export const REMOVE_COUPON_QUERY = gql`
  mutation removeCouponFromCart($cartId: String!) {
    removeCouponFromCart(input: { cart_id: $cartId }) {
      cart {
        ...cartFields
      }
    }
  }
  ${CART_FIELDS}
`

export const SET_SHIPPING_METHOD_QUERY = gql`
  mutation setShippingMethodsOnCart(
    $cartId: String!
    $carrier_code: String!
    $method_code: String!
  ) {
    setShippingMethodsOnCart(
      input: {
        cart_id: $cartId
        shipping_methods: [
          { carrier_code: $carrier_code, method_code: $method_code }
        ]
      }
    ) {
      cart {
        shipping_addresses {
          selected_shipping_method {
            carrier_code
            method_code
            carrier_title
            method_title
          }
        }
      }
    }
  }
`

export const SET_PAYMENT_METHOD_QUERY = gql`
  mutation setPaymentMethodOnCart($cartId: String!, $code: String!) {
    setPaymentMethodOnCart(
      input: { cart_id: $cartId, payment_method: { code: $code } }
    ) {
      cart {
        selected_payment_method {
          code
        }
      }
    }
  }
`

export const PLACE_ORDER_QUERY = gql`
  mutation placeOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      order {
        order_number
      }
    }
  }
`
