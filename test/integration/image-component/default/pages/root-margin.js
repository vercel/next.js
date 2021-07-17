import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Pass rootMargin prop</p>
      <Image
        id="rootMargin1"
        src="/test.jpg"
        width="400"
        height="400"
        rootMargin="0px 0px 0px 0px"
      />
      <div style={{ height: '120vh' }}>
        <p>Check Network tab & Scroll Down</p>
      </div>
      <Image
        id="rootMargin2"
        src="/wide.png"
        width="400"
        height="400"
        rootMargin="0px 0px 200px 0px"
      />
      <Image
        id="rootMargin3"
        src="/small.jpg"
        width="400"
        height="400"
        rootMargin="0px 0px 50% 0px"
      />
    </div>
  )
}

export default Page
