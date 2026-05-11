import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <p>Layout Intrinsic</p>
      <Image
        id="intrinsic1"
        src="/wide.png"
        width="1200"
        height="700"
        layout="intrinsic"
      ></Image>
      <Image
        id="intrinsic2"
        src="/wide.png"
        width="1200"
        height="700"
        layout="intrinsic"
      ></Image>
      <Image
        id="intrinsic3"
        src="/wide.png"
        width="1200"
        height="700"
        layout="intrinsic"
      ></Image>
      <Image
        id="intrinsic4"
        src="/wide.png"
        width="1200"
        height="700"
        layout="intrinsic"
      ></Image>
      <p>Layout Intrinsic</p>
    </div>
  )
}

export default Page
