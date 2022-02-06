import React, { useRef } from 'react'
import Image from 'next/image'

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
            id="myImage"
            src="/test.jpg"
            width="400"
            height="400"
            lazyBoundary="1800px"
          />
        </div>
      </div>
    </>
  )
}
export default Page
