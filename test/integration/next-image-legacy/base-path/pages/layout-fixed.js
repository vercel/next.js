import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <p>Layout Fixed</p>
      <Image
        id="fixed1"
        src="/docs/wide.png"
        width="1200"
        height="700"
        layout="fixed"
      ></Image>
      <Image
        id="fixed2"
        src="/docs/wide.png"
        width="1200"
        height="700"
        layout="fixed"
      ></Image>
      <Image
        id="fixed3"
        src="/docs/wide.png"
        width="1200"
        height="700"
        layout="fixed"
      ></Image>
      <Image
        id="fixed4"
        src="/docs/wide.png"
        width="1200"
        height="700"
        layout="fixed"
      ></Image>
      <p>Layout Fixed</p>
    </div>
  )
}

export default Page
