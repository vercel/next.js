import React from 'react'
import Image from 'next/image'

const myLoader = ({ src, width, quality }) => {
  return `https://customresolver.com/${src}?w~~${width},q~~${quality}`
}

const MyImage = (props) => {
  return <Image loader={myLoader} {...props}></Image>
}

const Page = () => {
  return (
    <div>
      <p id="client-side">Image Client Side Test</p>
      <MyImage
        id="basic-image"
        src="foo.jpg"
        loading="eager"
        width={300}
        height={400}
        quality={60}
      />
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
        loading="eager"
        width={300}
        height={400}
      />
    </div>
  )
}

export default Page
