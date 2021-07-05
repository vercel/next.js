import React from 'react'
import Link, { LinkProps } from 'next/link'

const LinkComponent = () => {
  const props: LinkProps = {
    href: '/page',
    as: '/as-page',
  }

  return (
    <Link {...props}>
      <a>Test</a>
    </Link>
  )
}

export default LinkComponent
