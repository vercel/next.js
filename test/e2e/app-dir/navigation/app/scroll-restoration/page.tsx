'use client'
import Link from 'next/link'
import React, { useContext } from 'react'
import { ItemsContext } from './context'

export default function Page() {
  const { items, loadMoreItems } = useContext(ItemsContext)

  return (
    <div>
      <h1>Page</h1>
      <ul>
        {items.map((item) => (
          <li key={item.id}>Item {item.id}</li>
        ))}
      </ul>
      <button id="load-more" onClick={loadMoreItems}>
        Load More
      </button>
      <Link href="/scroll-restoration/other">Go to Other</Link>
    </div>
  )
}
