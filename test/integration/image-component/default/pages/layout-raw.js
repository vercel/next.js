import React from 'react'
import Image from 'next/image'

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
          layout="raw"
          objectFit="cover"
          loading="eager"
        ></Image>
      </div>
      <div id="image-container2">
        <Image
          id="raw2"
          src="/wide.png"
          width="1200"
          height="700"
          objectFit="cover"
          objectPosition="50% 50%"
          style={{
            paddingLeft: '4rem',
            width: '100%',
            objectPosition: '30% 30%',
          }}
          layout="raw"
        ></Image>
      </div>
      <div id="image-container3">
        <Image
          id="raw3"
          src="/test.png"
          width="400"
          height="400"
          layout="raw"
        ></Image>
      </div>
    </div>
  )
}

export default Page
