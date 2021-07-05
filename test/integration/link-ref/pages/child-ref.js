import React from 'react'
import Link from 'next/link'

const ChildRef = () => {
  const myRef = React.createRef(null)

  React.useEffect(() => {
    if (!myRef.current) {
      console.error(`ref wasn't updated`)
    }
  })

  return (
    <Link href="/">
      <a ref={myRef}>Click me</a>
    </Link>
  )
}

export default ChildRef
