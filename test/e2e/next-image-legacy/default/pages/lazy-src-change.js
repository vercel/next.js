import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  const [src, setSrc] = React.useState('/test.jpg')
  return (
    <div>
      <p>Home Page</p>
      <div id="spacer" style={{ height: '150vh' }} />
      <Image id="basic-image" src={src} width="400" height="400"></Image>
      <button id="button-change-image-src" onClick={() => setSrc('/test.png')}>
        Change Image
      </button>
    </div>
  )
}

export default Page
