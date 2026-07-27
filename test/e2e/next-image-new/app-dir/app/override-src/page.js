import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Override Src</p>
      <Image
        id="override-src"
        alt=""
        src="/test.jpg"
        overrideSrc="/myoverride"
        width={400}
        height={400}
      />
    </div>
  )
}

export default Page
