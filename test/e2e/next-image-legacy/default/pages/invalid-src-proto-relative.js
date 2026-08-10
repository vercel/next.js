import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <p>Invalid Protocol Relative Source</p>
      <Image src="//assets.example.com/img.jpg" width="10" height="10" />
    </div>
  )
}

export default Page
