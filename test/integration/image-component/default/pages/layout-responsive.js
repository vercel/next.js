import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Layout Responsive</p>
      <Image
        id="responsive1"
        src="/test.jpg"
        width="400"
        height="400"
        layout="responsive"
      ></Image>
      <Image
        id="responsive2"
        src="/test.png"
        width="400"
        height="400"
        layout="responsive"
      ></Image>
      <Image
        id="responsive3"
        src="/test.png"
        width="400"
        height="400"
        layout="responsive"
      ></Image>
      <Image
        id="responsive4"
        src="/test.png"
        width="400"
        height="400"
        layout="responsive"
      ></Image>
      <p>Layout Responsive</p>
    </div>
  )
}

export default Page
