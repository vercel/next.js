import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <Image
        id="invalid-placeholder-blur"
        src="/test.png"
        placeholder="blur"
        width={200}
        height={200}
      />
    </div>
  )
}

export default Page
