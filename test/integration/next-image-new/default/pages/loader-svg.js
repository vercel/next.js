import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>Should work with SVG</h1>
      <Image
        id="with-loader"
        src="/test.svg"
        width={100}
        height={100}
        loader={({ src, width }) => `${src}?size=${width}`}
      />
      <br />
      <Image id="without-loader" src="/test.svg" width={100} height={100} />
      <footer>footer</footer>
    </div>
  )
}

export default Page
