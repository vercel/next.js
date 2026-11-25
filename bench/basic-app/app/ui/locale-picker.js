'use client'
import { describeBlogVendor } from './vendor-blog'
import { useState } from 'react'
const LOCALES = ['English', 'Français', 'Deutsch', '日本語', '한국어']
export default function LocalePicker() {
  const [locale, setLocale] = useState(LOCALES[0])
  return (
    <label className="locale-picker text-xs">
      <span className="sr-only">Language</span>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        {LOCALES.map((l) => (
          <option key={l}>{l}</option>
        ))}
      </select>
    </label>
  )
}
export const __vendor = typeof describeBlogVendor
