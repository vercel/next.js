import React from 'react'
import Image from 'next/legacy/image'
import Link from 'next/link'

const myLoader = ({ src, width, quality }) => {
  return `https://next-data-api-endpoint.vercel.app/next-image-legacy/${src}?w~~${width},q~~${quality}`
}

const MyImage = (props) => {
  return <Image loader={myLoader} {...props}></Image>
}

const Page = () => {
  return (
    <div>
      <p id="ssr">Image SSR Test</p>
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
        src="https://next-data-api-endpoint.vercel.app/next-image-legacy/foo.jpg"
        loading="eager"
        width={300}
        height={400}
      />
      <Link href="/client-side" id="clientlink">
        Client Side
      </Link>
    </div>
  )
}

export default Page
