import React from 'react'
import Link from 'next/link'

export default function LinkUnstyled({
  as,
  href,
  scroll,
  shallow,
  replace,
  children,
  ...props
}) {
  if (typeof href === 'string' && href.startsWith('http')) {
    // external links
    return (
      <a {...props} href={href} rel="noopener noreferrer">
        {children}
      </a>
    )
  }

  return (
    <Link
      shallow={shallow}
      scroll={scroll}
      replace={replace}
      href={href}
      as={as}
    >
      <a {...props}>{children}</a>
    </Link>
  )
}
