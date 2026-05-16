import { createContext } from 'react'

export interface Item {
  id: number
}

export const ItemsContext = createContext<{
  items: Item[]
  loadMoreItems: () => void
}>({ items: [], loadMoreItems: () => {} })
