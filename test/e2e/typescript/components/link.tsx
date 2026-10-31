import React from 'react'
import Link, { LinkProps } from 'next/link'

export default () => {
  const props: LinkProps = {
    href: '/page',
    as: '/as-page',
  }

  return <Link {...props}>Test</Link>
}
