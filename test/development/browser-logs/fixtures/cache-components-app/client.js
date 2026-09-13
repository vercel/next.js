'use client'

export function Display({ item, items }) {
  return (
    <p>
      {item.name}: {items.length} items
    </p>
  )
}
