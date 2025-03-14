import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>nextUrlServerPrefix</p>
      <Image id="test1" src="/test.jpg" width={200} height={200} />
    </div>
  )
}

export default Page
