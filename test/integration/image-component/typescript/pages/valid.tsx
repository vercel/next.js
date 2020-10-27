import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image
        id="width-and-height-num"
        src="https://via.placeholder.com/500"
        width={500}
        height={500}
      ></Image>
      <Image
        id="width-and-height-str"
        src="https://via.placeholder.com/500"
        width="500"
        height="500"
      ></Image>
      <Image
        id="unsized-image"
        src="https://via.placeholder.com/100"
        unsized
      ></Image>
      <p id="stubtext">This is valid usage of the Image component</p>
    </div>
  )
}

export default Page
