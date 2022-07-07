import React from 'react'
import Image from 'next/future/image'

const myLoader = ({ src, width, quality }) => {
  return `https://example.vercel.sh${src}?w~~${width},q~~${quality}`
}

const Page = () => {
  return (
    <div>
      <p>noscript images</p>
      <Image id="basic-image" src="/basic.jpg" width={640} height={360} />
      <Image
        loader={myLoader}
        id="image-with-loader"
        src="/remote-image.jpg"
        width={640}
        height={360}
      />
      <Image
        id="image-with-blur"
        src="/blur.jpg"
        width={640}
        height={360}
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mMU/M9QDwADygGR4qH9qQAAAABJRU5ErkJggg=="
      />
    </div>
  )
}

export default Page
