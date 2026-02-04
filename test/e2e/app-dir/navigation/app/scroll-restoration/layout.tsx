'use client'
import { useState } from 'react'
import { ItemsContext, type Item } from './context'

const createItems = (start: number, end: number): Item[] => {
  const items: Item[] = []
  for (let i = start; i <= end; i++) {
    items.push({ id: i })
  }
  return items
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>(createItems(1, 50))

  const loadMoreItems = () => {
    const start = items.length + 1
    const end = start + 50 - 1
    setItems((prevItems) => [...prevItems, ...createItems(start, end)])
  }

  return (
    <ItemsContext.Provider value={{ items, loadMoreItems }}>
      {children}
    </ItemsContext.Provider>
  )
}
