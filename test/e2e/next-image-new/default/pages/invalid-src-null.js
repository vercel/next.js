import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Invalid Source Null</p>
      <Image alt="alt" id="id" src={null} width={400} height={400} />
    </div>
  )
}

export default Page
