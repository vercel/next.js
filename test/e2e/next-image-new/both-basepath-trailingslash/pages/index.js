import React from 'react'
import Image from 'next/image'
import img from '../public/test.jpg'

const Page = () => {
  return (
    <div>
      <p>Trailing Slash</p>
      <Image id="import-img" alt="import-img" src={img} priority />
      <br />
      <Image
        id="string-img"
        alt="string-img"
        src="/prefix/test.jpg"
        width={200}
        height={200}
      />
    </div>
  )
}

export default Page
