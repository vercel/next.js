import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <h1>Warn when "sizes" is not used</h1>
      <Image
        layout="fixed"
        src="/test.png"
        width={400}
        height={400}
        sizes="50vw"
      />
      <Image
        layout="intrinsic"
        src="/test.jpg"
        width={400}
        height={400}
        sizes="50vw"
      />
      <Image
        layout="responsive"
        src="/test.webp"
        width={400}
        height={400}
        sizes="50vw"
      />
      <div style={{ position: 'relative', width: '200px', height: '200px' }}>
        <Image src="/test.gif" layout="fill" objectFit="cover" sizes="50vw" />
      </div>
      <footer>footer</footer>
    </div>
  )
}

export default Page
