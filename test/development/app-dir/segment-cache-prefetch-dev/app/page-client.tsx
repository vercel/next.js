'use client'

import Link from 'next/link'
import { useState } from 'react'

export default function PageClient() {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion="/page-b"
      />
      {isVisible ? (
        <Link href="/page-b">Go to Page B</Link>
      ) : (
        <>Go to Page B (link is hidden)</>
      )}
    </>
  )
}
