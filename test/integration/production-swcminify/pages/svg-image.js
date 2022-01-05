import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>SVG with a script tag attempting XSS</h1>
      <Image id="img" src="/xss.svg" width="100" height="100" />
      <p id="msg">safe</p>
    </div>
  )
}

export default Page
