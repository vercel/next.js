'use client'

import Link, { type LinkProps } from 'next/link'
import { useState } from 'react'

const productHandles = ['alpha', 'gamma', 'delta', 'epsilon', 'zeta', 'eta']

export function LinkAccordion({
  href,
  children,
  prefetch,
}: {
  href: string
  children: React.ReactNode
  prefetch?: LinkProps['prefetch']
}) {
  const [isVisible, setIsVisible] = useState(false)
  return (
    <>
      <input
        type="checkbox"
        checked={isVisible}
        onChange={() => setIsVisible(!isVisible)}
        data-link-accordion={href}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        `${children} (link is hidden)`
      )}
    </>
  )
}

export function ProductLinks() {
  const [areVisible, setAreVisible] = useState(false)
  const [isBetaVisible, setIsBetaVisible] = useState(false)

  return (
    <>
      <input
        type="checkbox"
        checked={areVisible}
        onChange={() => setAreVisible(!areVisible)}
        data-product-links
      />
      <input
        type="checkbox"
        checked={isBetaVisible}
        onChange={() => setIsBetaVisible(!isBetaVisible)}
        data-beta-link
      />
      {areVisible ? (
        <ul>
          {productHandles.map((handle) => (
            <li key={handle}>
              <Link href={`/products/${handle}`}>{handle}</Link>
            </li>
          ))}
        </ul>
      ) : (
        'product links are hidden'
      )}
      {isBetaVisible ? (
        <Link href="/products/beta" prefetch={false}>
          beta
        </Link>
      ) : null}
    </>
  )
}
