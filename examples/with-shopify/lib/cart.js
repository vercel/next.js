import { createContext, useContext, useState } from 'react'
import graphqlFetch from '@/lib/graphql-fetch'
// import Cookies from 'js-cookie'
// import useSWR from 'swr'

const Checkout = createContext()
const Cart = createContext()

// const getCheckoutId = () => Cookies.get('checkoutId')

// const setCheckoutId = (id) => {
//   Cookies.set('checkoutId', id, {
//     expires: 7,
//     secure: process.env.NODE_ENV === 'production',
//     sameSite: 'lax',
//   })
// }

// const useCheckout = () => {
//   const {data,error} = useSWR('')
// }

export const useCart = () => useContext(Cart)

export const useCheckout = () => {
  const { checkout, setCheckout } = useContext(Checkout)
  const setLineItems = async (lineItems) => {
    const data = checkout
      ? await graphqlFetch(
          `mutation ReplaceLineItems($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
            checkoutLineItemsReplace(checkoutId: $checkoutId, lineItems: $lineItems) {
              userErrors {
                code
                field
                message
              }
              checkout {
                id
                lineItems(first: 200) {
                  edges {
                    node {
                      quantity
                      variant {
                        id
                        title
                        priceV2 {
                          amount
                          currencyCode
                        }
                        selectedOptions {
                          name
                          value
                        }
                        image {
                          altText
                          originalSrc
                          transformedSrc(maxHeight: 104, maxWidth: 104, crop: CENTER)
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
          {
            variables: { checkoutId: checkout.id, lineItems },
          }
        ).then((d) => d.checkoutLineItemsReplace)
      : await graphqlFetch(
          `mutation CreateCheckout($input: CheckoutCreateInput!) {
            checkoutCreate(input: $input) {
              checkoutUserErrors {
                code
                field
                message
              }
              checkout {
                id
                lineItems(first: 200) {
                  edges {
                    node {
                      quantity
                      variant {
                        id
                        title
                        priceV2 {
                          amount
                          currencyCode
                        }
                        selectedOptions {
                          name
                          value
                        }
                        image {
                          altText
                          originalSrc
                          transformedSrc(maxHeight: 104, maxWidth: 104, crop: CENTER)
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
          {
            variables: { input: { lineItems } },
          }
        ).then((d) => d.checkoutCreate)

    const newCheckout = data.checkout

    if (newCheckout) setCheckout(newCheckout)

    return data
  }

  return { checkout, setLineItems }
}

export const CartProvider = ({ children }) => {
  const [isOpen, setOpen] = useState(false)
  const [checkout, setCheckout] = useState()
  const openCart = () => setOpen(true)
  const closeCart = () => setOpen(false)

  return (
    <Cart.Provider value={{ isOpen, openCart, closeCart }}>
      <Checkout.Provider value={{ checkout, setCheckout }}>
        {children}
      </Checkout.Provider>
    </Cart.Provider>
  )
}
