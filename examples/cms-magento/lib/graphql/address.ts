import gql from 'graphql-tag'

export const STATE_LIST_QUERY = gql`
  query getStateByCountry($id: String!) {
    country(id: $id) {
      available_regions {
        code
        name
      }
      full_name_english
      id
    }
  }
`

export const SHIPPING_ADDRESS_FIELDS = gql`
  fragment shippingAddressFields on Cart {
    shipping_addresses {
      firstname
      lastname
      street
      city
      region {
        code
        label
      }
      postcode
      telephone
      country {
        code
        label
      }
      available_shipping_methods {
        amount {
          currency
          value
        }
        available
        carrier_code
        carrier_title
        error_message
        method_code
        method_title
      }
      selected_shipping_method {
        carrier_code
        method_code
        carrier_title
        method_title
      }
    }
  }
`

export const BILLING_ADDRESS_FIELDS = gql`
  fragment billingAddressFields on Cart {
    billing_address {
      firstname
      lastname
      street
      city
      region {
        code
        label
      }
      postcode
      telephone
      country {
        code
        label
      }
    }
  }
`

export const AVAILABLE_PAYMENT_FIELDS = gql`
  fragment availablePaymentMethodsFields on Cart {
    available_payment_methods {
      code
      title
    }
  }
`

export const SET_EMAIL_ON_CART = gql`
  mutation setGuestEmailOnCart($cartId: String!, $email: String!) {
    setGuestEmailOnCart(input: { cart_id: $cartId, email: $email }) {
      cart {
        email
      }
    }
  }
`

export const SET_SHIPPING_ADDRESS_QUERY = gql`
  mutation setShippingAddressesOnCart(
    $cartId: String!
    $firstname: String!
    $lastname: String!
    $street: String!
    $city: String!
    $region: String!
    $postcode: String!
    $country_code: String!
    $telephone: String!
    $save_in_address_book: Boolean!
  ) {
    setShippingAddressesOnCart(
      input: {
        cart_id: $cartId
        shipping_addresses: [
          {
            address: {
              firstname: $firstname
              lastname: $lastname
              street: [$street]
              city: $city
              region: $region
              postcode: $postcode
              country_code: $country_code
              telephone: $telephone
              save_in_address_book: $save_in_address_book
            }
          }
        ]
      }
    ) {
      cart {
        ...shippingAddressFields
        ...availablePaymentMethodsFields
      }
    }
  }
  ${SHIPPING_ADDRESS_FIELDS}
  ${AVAILABLE_PAYMENT_FIELDS}
`

export const SET_BILLING_ADDRESS_QUERY = gql`
  mutation setBillingAddressesOnCart(
    $cartId: String!
    $firstname: String!
    $lastname: String!
    $street: String!
    $city: String!
    $region: String!
    $postcode: String!
    $country_code: String!
    $telephone: String!
    $save_in_address_book: Boolean!
    $same_as_shipping: Boolean!
  ) {
    setBillingAddressOnCart(
      input: {
        cart_id: $cartId
        billing_address: {
          address: {
            firstname: $firstname
            lastname: $lastname
            street: [$street]
            city: $city
            region: $region
            postcode: $postcode
            country_code: $country_code
            telephone: $telephone
            save_in_address_book: $save_in_address_book
          }
          same_as_shipping: $same_as_shipping
        }
      }
    ) {
      cart {
        ...shippingAddressFields
        ...billingAddressFields
        ...availablePaymentMethodsFields
      }
    }
  }
  ${SHIPPING_ADDRESS_FIELDS}
  ${BILLING_ADDRESS_FIELDS}
  ${AVAILABLE_PAYMENT_FIELDS}
`
