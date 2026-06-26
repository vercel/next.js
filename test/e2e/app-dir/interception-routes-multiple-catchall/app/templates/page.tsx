import Link from 'next/link'
import React from 'react'

function Page() {
  return (
    <div>
      Simple Page
      <Link href={'/showcase/new'}>showcase/new</Link>
    </div>
  )
}

export default Page
