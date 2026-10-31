'use client'
import { describeDocsVendor } from './vendor-docs'
import { useState } from 'react'
export default function VersionPicker({ versions, current }) {
  const [value, setValue] = useState(current)
  return (
    <label className="version-picker text-xs">
      <span className="sr-only">Documentation version</span>
      <select value={value} onChange={(e) => setValue(e.target.value)}>
        {versions.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  )
}
export const __vendor = typeof describeDocsVendor
