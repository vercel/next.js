'use client'

import Link from 'next/link'
import { useState } from 'react'

export function LinkAccordion() {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion="/viewport-error"
      />
      {isVisible ? (
        <Link href="/viewport-error">viewport error</Link>
      ) : (
        'viewport error (link is hidden)'
      )}
    </>
  )
}
