import { createContext, useContext, useState } from 'react'
import graphqlFetch from '@/lib/graphql-fetch'

export const MAX_PER_ITEM = 5

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

const setLineItems = async (checkout, lineItems) =>
  checkout
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

const validateItem = (item) => {
  console.log('U', item.quantity, MAX_PER_ITEM)
  if (item.quantity > MAX_PER_ITEM) {
    throw new Error(`Up to ${MAX_PER_ITEM} units are allowed per product`)
  }
}

export const useCart = () => useContext(Cart)

export const useCheckout = () => {
  const { openCart } = useCart()
  const { checkout, setCheckout } = useContext(Checkout)
  const [{ loading, errorMsg }, setStatus] = useState({ loading: false })
  const lineItems = checkout?.lineItems.edges ?? []
  const setItems = async (items, open = true) => {
    try {
      items.forEach(validateItem)
      setStatus({ loading: true })

      const data = await setLineItems(checkout, items)
      const errors = data.checkoutUserErrors ?? data.userErrors

      if (errors.length) {
        console.error('Checkout failed with:', errors)
        throw errors[0]
      }
      setStatus({ loading: false })

      return data
    } catch (error) {
      console.error(error)
      setStatus({ loading: false, errorMsg: error.message })
    }
  }
  const addItem = (item, quantity = 1) => {
    let found = false

    // Get current items
    const items =
      lineItems.map(({ node }) => {
        let { quantity: currentQuantity } = node

        if (node.variant.id === item.id) {
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
      items.push({ variantId: item.id, quantity })
    }

    setItems(items).then((data) => {
      if (data) {
        setCheckout(data.checkout)
        openCart()
      }
    })
  }
  const updateItem = (item) => {
    const items = lineItems.flatMap(({ node }) => {
      if (node.variant.id === item.variantId) {
        // Remove or update the item
        return item.quantity <= 0 ? [] : [item]
      }
      return [
        {
          variantId: node.variant.id,
          quantity: node.quantity,
        },
      ]
    })

    setItems(items, false).then((data) => {
      if (data) setCheckout(data.checkout)
    })
  }
  // Creates a new checkout with a single item, the current checkout is kept intact
  const buyNow = (item, quantity) =>
    setItems([{ variantId: item.id, quantity }])

  return {
    checkout,
    loading,
    errorMsg,
    addItem,
    updateItem,
    buyNow,
  }
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
