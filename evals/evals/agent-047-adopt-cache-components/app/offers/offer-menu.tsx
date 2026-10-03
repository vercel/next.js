'use client'

import { useState } from 'react'

export function OfferMenu() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <section>
      <button aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        Offer details
      </button>
      {isOpen && (
        <div role="region" aria-label="Offer details">
          Use code NORTHSTAR for free shipping.
        </div>
      )}
    </section>
  )
}
