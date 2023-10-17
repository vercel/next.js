import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <h1>Priority Missing Warning Page</h1>
      <Image
        id="responsive"
        layout="responsive"
        src="/wide.png"
        width="1200"
        height="700"
      />
      <Image
        id="fixed"
        layout="fixed"
        src="/test.jpg"
        width="400"
        height="400"
      />
      <footer>Priority Missing Warning Footer</footer>
    </div>
  )
}

export default Page
