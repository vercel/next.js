'use client'
import { useState } from 'react'
export default function CodeCopy({ text }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="code-copy"
      onClick={() => {
        navigator.clipboard?.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
