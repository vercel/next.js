import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image id="basic-image" src="/test.jpg"></Image>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
