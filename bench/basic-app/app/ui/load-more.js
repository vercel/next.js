'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function LoadMore({ total, pageSize }) {
  const [shown, setShown] = useState(pageSize)
  if (shown >= total) return null
  return (
    <button
      type="button"
      className="load-more"
      onClick={() => setShown((s) => s + pageSize)}
    >
      Load more ({total - shown} remaining)
    </button>
  )
}
export const __vendor = typeof describeBlogVendor
