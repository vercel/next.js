import Link from 'next/link'
import React from 'react'

const Page = () => {
  return (
    <>
      <h1>Content for page 2</h1>
      <Link
        data-next-shallow-replace
        replace
        shallow
        href={{ query: { params: 'testParams' } }}
      >
        Shallow replace
      </Link>
      <div>
        <button data-go-back onClick={() => window.history.back()}>
          Go Back
        </button>
      </div>
    </>
  )
}

export default Page
