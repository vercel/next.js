import Link from 'next/link'
import React from 'react'

const Page = () => {
  return (
    <>
      <h1>Content for page 1</h1>
      <div>
        <Link
          data-next-shallow-push
          shallow
          href={{ query: { params: 'testParams' } }}
        >
          Shallow push
        </Link>
      </div>
      <div>
        <Link data-next-page href="/page2">
          Go to page 2
        </Link>
      </div>
    </>
  )
}

export default Page
