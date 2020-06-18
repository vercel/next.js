import { createContext, useContext, useState } from 'react'

const Cart = createContext()

export const useCart = () => useContext(Cart)

export const CartProvider = ({ children }) => {
  const [isOpen, setOpen] = useState(false)
  const openCart = () => setOpen(true)
  const closeCart = () => setOpen(false)

  return (
    <Cart.Provider value={{ isOpen, openCart, closeCart }}>
      {children}
    </Cart.Provider>
  )
}
