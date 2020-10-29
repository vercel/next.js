import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Deprecated use of "unsized"</p>
      <Image src="/test.png" unsized></Image>
    </div>
  )
}

export default Page
