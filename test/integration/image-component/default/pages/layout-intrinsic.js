import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Intrinsic</p>
      <Image
        id="intrinsic1"
        src="/test.jpg"
        width="400"
        height="400"
        layout="intrinsic"
      ></Image>
      <Image
        id="intrinsic2"
        src="/test.png"
        width="400"
        height="400"
        layout="intrinsic"
      ></Image>
      <Image
        id="intrinsic3"
        src="/test.png"
        width="400"
        height="400"
        layout="intrinsic"
      ></Image>
      <Image
        id="intrinsic4"
        src="/test.png"
        width="400"
        height="400"
        layout="intrinsic"
      ></Image>
      <p>Layout Intrinsic</p>
    </div>
  )
}

export default Page
