import { createContext, useContext, useState } from 'react'
import graphqlFetch from '@/lib/graphql-fetch'

const Checkout = createContext()
const Cart = createContext()

const CheckoutFields = `
  fragment CheckoutFields on Checkout {
    id
    webUrl
    subtotalPriceV2 {
      amount
      currencyCode
    }
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
            compareAtPriceV2 {
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
  const { openCart } = useCart()
  const { checkout, setCheckout } = useContext(Checkout)
  const [{ loading, errorMsg }, setStatus] = useState({ loading: false })
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
  const addVariantToCart = (variant, quantity = 1) => {
    let found = false

    // Get current items
    const items =
      checkout?.lineItems.edges.map(({ node }) => {
        let { quantity: currentQuantity } = node

        if (node.variant.id === variant.id) {
          // Update the current item in the checkout
          found = true
          currentQuantity += quantity
        }

        return {
          variantId: node.variant.id,
          quantity: currentQuantity,
        }
      }) ?? []

    if (!found) {
      // Add the item to the checkout
      items.push({ variantId: variant.id, quantity })
    }

    setStatus({ loading: true })
    setLineItems(items)
      .then((data) => {
        const errors = data.checkoutUserErrors ?? data.userErrors

        if (errors.length) {
          console.error('Checkout failed with:', errors)
          throw errors[0]
        }
        setStatus({ loading: false })
        openCart()
      })
      .catch((error) => {
        setStatus({ loading: false, errorMsg: error.message })
      })
  }

  return { checkout, loading, errorMsg, setLineItems, addVariantToCart }
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
