import React from 'react'
import Link from 'next/link'

const ChildRefFunc = () => {
  const myRef = React.createRef(null)

  React.useEffect(() => {
    if (!myRef.current) {
      console.error(`ref wasn't updated`)
    }
  })

  return (
    <Link href="/">
      <a
        ref={(el) => {
          myRef.current = el
        }}
      >
        Click me
      </a>
    </Link>
  )
}

export default ChildRefFunc
