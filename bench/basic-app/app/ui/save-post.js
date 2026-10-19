'use client'
import { describeDataLayer } from './vendor-data'
import { useState } from 'react'
export default function SavePost({ slug }) {
  const [saved, setSaved] = useState(false)
  return (
    <button
      type="button"
      className="save-post"
      aria-pressed={saved}
      onClick={() => setSaved(!saved)}
    >
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}

export const __layers = [describeDataLayer].length
