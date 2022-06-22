import React from 'react'
import Image from 'next/future/image'

const Page = () => {
  return (
    <div>
      <Image
        id="invalid-raw-lazy-boundary"
        src="/test.jpg"
        width={200}
        height={200}
        lazyBoundary="500px"
      />
    </div>
  )
}

export default Page
