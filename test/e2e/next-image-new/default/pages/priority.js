import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Priority Page</p>
      <Image
        priority
        id="basic-image"
        alt="basic-image"
        src="/test.jpg"
        width="400"
        height="400"
      ></Image>
      <Image
        priority
        id="basic-image-crossorigin"
        alt="basic-image-crossorigin"
        src="/test.webp"
        width="400"
        height="400"
        crossOrigin="use-credentials"
      ></Image>
      <Image
        priority
        id="basic-image-referrerpolicy"
        alt="basic-image-referrerpolicy"
        src="/test.png"
        width="400"
        height="400"
        referrerPolicy="no-referrer"
      ></Image>
      <Image
        loading="eager"
        id="load-eager"
        alt="load-eager"
        src="/test.png"
        width="200"
        height="200"
      ></Image>
      <Image
        priority
        id="responsive1"
        alt="responsive1"
        src="/wide.png"
        width="1200"
        height="700"
        sizes="100vw"
      />
      <Image
        priority
        id="responsive2"
        alt="responsive2"
        src="/wide.png"
        width="1200"
        height="700"
        sizes="100vw"
      />
      <Image
        id="pri-low"
        alt="pri-low"
        src="/test.webp"
        width="100"
        height="100"
        fetchPriority="low"
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
