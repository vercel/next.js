import React from 'react'
import Link from 'next/link'

const MyLink = React.forwardRef((props, ref) => (
  <a {...props} ref={ref}>
    Click me
  </a>
))

const Function = () => (
  <Link href="/" passHref>
    <MyLink />
  </Link>
)

export default Function
