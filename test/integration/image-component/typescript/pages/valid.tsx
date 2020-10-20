import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image
        id="basic-image"
        src="https://via.placeholder.com/500"
        width={400}
        height={400}
      ></Image>
      <Image
        id="unsized-image"
        src="https://via.placeholder.com/500"
        unsized
      ></Image>
      <p id="stubtext">This is valid usage for the Image component</p>
    </div>
  )
}

export default Page
