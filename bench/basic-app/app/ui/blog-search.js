'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function BlogSearch({ placeholder }) {
  const [value, setValue] = useState('')
  return (
    <label className="search">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
        <path
          d="m21 21-4-4"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </label>
  )
}
export const __vendor = typeof describeBlogVendor
