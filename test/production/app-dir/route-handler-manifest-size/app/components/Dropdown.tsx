'use client'

import { useState } from 'react'

export function Dropdown({
  items,
}: {
  items: { label: string; value: string }[]
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <div className="relative">
      <button onClick={() => setIsOpen(!isOpen)}>
        {selected || 'Select an option'}
      </button>
      {isOpen && (
        <ul className="absolute mt-1 bg-white border rounded shadow">
          {items.map((item) => (
            <li
              key={item.value}
              onClick={() => {
                setSelected(item.label)
                setIsOpen(false)
              }}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
