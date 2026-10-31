'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
export default function ReadingProgress() {
  const [progress] = useState(0)
  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-valuenow={progress}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{ width: progress + '%' }}
    />
  )
}
export const __vendor = typeof describeBlogVendor
