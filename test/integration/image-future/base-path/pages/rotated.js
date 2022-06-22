import Image from 'next/future/image'
import React from 'react'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image id="exif-rotation-image" src="/docs/exif-rotation.jpg" />
      <p id="stubtext">This is the rotated page</p>
    </div>
  )
}

export default Page
