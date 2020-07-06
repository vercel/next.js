import { createContext, useContext, useState } from 'react'
import graphqlFetch from '@/lib/graphql-fetch'

const Checkout = createContext()
const Cart = createContext()

const CheckoutFields = `
  fragment CheckoutFields on Checkout {
    id
    webUrl
    lineItems(first: 200) {
      edges {
        node {
          title
          quantity
          variant {
            id
            product {
              handle
            }
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
              transformedSrc(maxHeight: 96, maxWidth: 96, crop: CENTER)
            }
          }
        }
      }
    }
  }
`

const CreateCheckout = `
  mutation CreateCheckout($input: CheckoutCreateInput!) {
    checkoutCreate(input: $input) {
      checkoutUserErrors {
        code
        field
        message
      }
      checkout {
        ...CheckoutFields
      }
    }
  }
  ${CheckoutFields}
`

const ReplaceLineItems = `
  mutation ReplaceLineItems($checkoutId: ID!, $lineItems: [CheckoutLineItemInput!]!) {
    checkoutLineItemsReplace(checkoutId: $checkoutId, lineItems: $lineItems) {
      userErrors {
        code
        field
        message
      }
      checkout {
        ...CheckoutFields
      }
    }
  }
  ${CheckoutFields}
`

export const useCart = () => useContext(Cart)

export const useCheckout = () => {
  const { checkout, setCheckout } = useContext(Checkout)
  const setLineItems = async (lineItems) => {
    const data = checkout
      ? await graphqlFetch(ReplaceLineItems, {
          variables: {
            checkoutId: checkout.id,
            lineItems,
          },
        }).then((d) => d.checkoutLineItemsReplace)
      : await graphqlFetch(CreateCheckout, {
          variables: {
            input: { lineItems },
          },
        }).then((d) => d.checkoutCreate)

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
