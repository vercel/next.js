'use client'

import Foo from '../foo'

// Intermediate component for testing owner stack
function Inner() {
  return <Foo />
}

export default function Page() {
  return (
    <div>
      <Inner />
    </div>
  )
}
