'use client'

import Link, { type LinkProps } from 'next/link'
import { ComponentProps, useState } from 'react'

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
        data-prefetch={getPrefetchKind(prefetch)}
      />
      {isVisible ? (
        <Link href={href} prefetch={prefetch}>
          {children}
        </Link>
      ) : (
        <>{children} (link is hidden)</>
      )}
    </>
  )
}

export function DebugLinkAccordion({
  href,
  prefetch,
}: Omit<ComponentProps<typeof LinkAccordion>, 'children'>) {
  const prefetchKind = getPrefetchKind(prefetch)
  return (
    <LinkAccordion href={href} prefetch={prefetch} data-prefetch={prefetch}>
      {href} ({prefetchKind})
    </LinkAccordion>
  )
}

function getPrefetchKind(prefetch: LinkProps['prefetch']) {
  switch (prefetch) {
    case false:
      return 'disabled'
    case undefined:
    case null:
    case 'auto':
      return 'auto'
    case true:
      return 'runtime'
    case 'unstable_forceStale':
      return 'full'
    default:
      prefetch satisfies never
  }
}
