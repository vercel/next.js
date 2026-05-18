import React, { useRef } from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  const myRef = useRef(null)

  return (
    <>
      <div
        ref={myRef}
        style={{
          width: '100%',
          height: '400px',
          position: 'relative',
          overflowY: 'scroll',
        }}
      >
        <div style={{ width: '400px', height: '600px' }}>hello</div>
        <div style={{ width: '400px', position: 'relative', height: '600px' }}>
          <Image
            id="myImage1"
            src="/test.jpg"
            alt="mine"
            width="400"
            height="400"
            lazyBoundary="1500px"
          />
          <Image
            lazyRoot={myRef}
            id="myImage2"
            src="/test.png"
            alt="mine"
            width="400"
            height="400"
            lazyBoundary="1800px"
          />
          <Image
            lazyRoot={myRef}
            id="myImage3"
            src="/test.svg"
            alt="mine"
            width="400"
            height="400"
            lazyBoundary="1800px"
          />

          <Image
            lazyRoot={myRef}
            id="myImage4"
            src="/test.webp"
            alt="mine"
            width="400"
            height="400"
            lazyBoundary="200px"
          />
        </div>
      </div>
    </>
  )
}
export default Page
