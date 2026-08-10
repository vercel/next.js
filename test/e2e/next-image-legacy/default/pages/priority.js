import React from 'react'
import Image from 'next/legacy/image'

const Page = () => {
  return (
    <div>
      <p>Priority Page</p>
      <Image
        priority
        id="basic-image"
        src="/test.jpg"
        width="400"
        height="400"
      ></Image>
      <Image
        priority
        id="basic-image-with-crossorigin"
        crossOrigin="use-credentials"
        src="/test.gif"
        width="400"
        height="400"
      ></Image>
      <Image
        priority
        id="basic-image-with-referrerpolicy"
        referrerPolicy="no-referrer"
        src="/test.png"
        width="400"
        height="400"
      ></Image>
      <Image
        priority
        id="basic-image-with-referrerpolicy"
        referrerPolicy="no-referrer"
        src="/test.png"
        width="400"
        height="400"
      ></Image>
      <Image
        loading="eager"
        id="load-eager"
        src="/test.png"
        width="400"
        height="400"
      ></Image>
      <Image
        priority
        id="responsive1"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      />
      <Image
        priority
        id="responsive2"
        src="/wide.png"
        width="1200"
        height="700"
        layout="responsive"
      />
      <p id="stubtext">This is the priority page</p>
      <div style={{ height: '1000vh' }} />
      <Image
        priority
        id="belowthefold"
        src="/test.tiff"
        width="400"
        height="400"
        alt=""
      />
    </div>
  )
}

export default Page
