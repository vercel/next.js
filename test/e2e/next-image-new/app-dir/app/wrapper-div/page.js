import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Wrapper Div</p>
      <div id="image-container1">
        <Image
          id="img1"
          src="/wide.png"
          width="1200"
          height="700"
          loading="eager"
        />
      </div>
      <div id="image-container2">
        <Image
          id="img2"
          src="/wide.png"
          width="1200"
          height="700"
          style={{
            paddingLeft: '4rem',
            width: '100%',
            objectPosition: '30% 30%',
          }}
          sizes="50vh"
        />
      </div>
      <div id="image-container3">
        <Image
          id="img3"
          src="/test.png"
          width="400"
          height="400"
          loading="eager"
        />
      </div>
      <div id="image-container4">
        <Image
          id="img4"
          src="/test.png"
          width="400"
          height="400"
          loading="eager"
          style={{ width: '50%', height: 'auto' }}
        />
      </div>
    </div>
  )
}

export default Page
