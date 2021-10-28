import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>Warn for this loader that doesnt use width</h1>
      <Image
        id="no-width"
        src="/test.png"
        width={100}
        height={100}
        loader={({ src }) => `${src}`}
      />
      <Image
        id="width-path"
        src="/test.jpg"
        width={100}
        height={100}
        loader={({ src, width }) => `${src}/${width}/file.jpg`}
      />
      <Image
        id="width-querystring"
        src="/test.webp"
        width={100}
        height={100}
        loader={({ src, width }) => `${src}?w=${width / 2}`}
      />
      <Image
        id="width-querystring-full"
        src="/test.gif"
        width={100}
        height={100}
        loader={({ src, width }) => `${src}?width=${width * 2}`}
      />
      <footer>footer</footer>
    </div>
  )
}

export default Page
