import React from 'react'
import Image from 'next/future/image'

const Page = () => {
  return (
    <div>
      <p>Layout Raw</p>
      <div id="image-container1">
        <Image
          id="raw1"
          src="/wide.png"
          width="1200"
          height="700"
          loading="eager"
        ></Image>
      </div>
      <div id="image-container2">
        <Image
          id="raw2"
          src="/wide.png"
          width="1200"
          height="700"
          style={{
            paddingLeft: '4rem',
            width: '100%',
            objectPosition: '30% 30%',
          }}
          sizes="50vh"
        ></Image>
      </div>
      <div id="image-container3">
        <Image
          id="raw3"
          src="/test.png"
          width="400"
          height="400"
          loading="eager"
        ></Image>
      </div>
      <div id="image-container4">
        <Image
          id="raw4"
          src="/test.png"
          width="400"
          height="400"
          loading="eager"
          style={{ width: '50%', height: 'auto' }}
        ></Image>
      </div>
    </div>
  )
}

export default Page
