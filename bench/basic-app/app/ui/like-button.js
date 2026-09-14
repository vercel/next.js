'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function LikeButton({ count, icon, slug }) {
  const [liked, setLiked] = useState(false)
  return (
    <button
      type="button"
      className="like-button text-xs"
      aria-pressed={liked}
      aria-label={'Like ' + slug}
      onClick={() => setLiked((l) => !l)}
    >
      {icon} {liked ? count + 1 : count}
    </button>
  )
}
export const __vendor = typeof describeBlogVendor
