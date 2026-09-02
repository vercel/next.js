'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function CopyPageButton({ icon }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="copy-page text-xs"
      onClick={() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
    >
      {icon} {copied ? 'Copied' : 'Copy page'}
    </button>
  )
}
export const __vendor = typeof describeDocsVendor
