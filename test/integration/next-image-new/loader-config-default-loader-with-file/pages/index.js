import React from 'react'
import Image from 'next/image'

function loader({ src, width, quality }) {
  return `${src}?wid=${width}&qual=${quality || 35}`
}

const Page = () => {
  return (
    <div>
      <h1>Loader Config</h1>
      <Image
        id="img1"
        alt="img1"
        src="/logo.png"
        width="400"
        height="400"
        priority
      />
      <p>Scroll down...</p>
      <div style={{ height: '100vh' }} />
      <h2>Loader Prop</h2>
      <Image
        id="img2"
        alt="img2"
        src="/logo.png"
        width="200"
        height="200"
        loader={loader}
      />
    </div>
  )
}

export default Page
