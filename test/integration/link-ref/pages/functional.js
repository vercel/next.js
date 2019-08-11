import React from 'react'
import Link from 'next/link'

const MyLink = React.forwardRef((props, ref) => (
  <a {...props} ref={ref}>
    Click me
  </a>
))

export default () => (
  <Link href='/' passHref>
    <MyLink />
  </Link>
)
