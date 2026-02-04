'use client'
import React from 'react'
import Link from 'next/link'

const MyLink = React.forwardRef((props, ref) => (
  <span {...props} ref={ref}>
    Click me
  </span>
))

export default () => (
  <Link href="/">
    <MyLink />
  </Link>
)
