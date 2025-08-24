'use client'
import React from 'react'
import Link from 'next/link'

export default () => {
  const myRef = React.createRef(null)

  React.useEffect(() => {
    if (!myRef.current) {
      console.error(`ref wasn't updated`)
    }
  })

  return (
    <Link href="/" ref={myRef}>
      Click me
    </Link>
  )
}
