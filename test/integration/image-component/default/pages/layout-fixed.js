import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fixed</p>
      <Image
        id="fixed1"
        src="/test.jpg"
        width="400"
        height="400"
        layout="fixed"
      ></Image>
      <Image
        id="fixed2"
        src="/test.png"
        width="400"
        height="400"
        layout="fixed"
      ></Image>
      <Image
        id="fixed3"
        src="/test.png"
        width="400"
        height="400"
        layout="fixed"
      ></Image>
      <Image
        id="fixed4"
        src="/test.png"
        width="400"
        height="400"
        layout="fixed"
      ></Image>
      <p>Layout Fixed</p>
    </div>
  )
}

export default Page
