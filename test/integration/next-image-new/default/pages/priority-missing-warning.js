import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>Priority Missing Warning Page</h1>
      <Image id="responsive" src="/wide.png" width="1200" height="700" />
      <Image id="fixed" src="/test.jpg" width="400" height="400" />
      <footer>Priority Missing Warning Footer</footer>
    </div>
  )
}

export default Page
