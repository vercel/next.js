import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Responsive</p>
      <Image
        id="responsive1"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      ></Image>
      <Image
        id="responsive2"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      ></Image>
      <Image
        id="responsive3"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      ></Image>
      <Image
        id="responsive4"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      ></Image>
      <p>Layout Responsive</p>
    </div>
  )
}

export default Page
