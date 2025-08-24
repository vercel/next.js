import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>SVG with a script tag attempting XSS</h1>
      <Image id="img" src="/xss.svg" width="100" height="100" />
      <a id="btn" href="/_next/image?url=%2Fxss.svg&w=256&q=75">
        Click Me
      </a>
      <p id="msg">safe</p>
    </div>
  )
}

export default Page
