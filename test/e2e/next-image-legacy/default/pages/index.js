import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <p>Home Page</p>
      <Image id="basic-image" src="/test.jpg" width="400" height="400"></Image>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
