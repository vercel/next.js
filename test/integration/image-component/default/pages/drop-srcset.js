import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <p>Drop srcSet prop (cannot be manually provided)</p>
      <Image
        src="/moving-truck.jpg"
        width={300}
        height={100}
        srcSet="/moving-truck-mobile.jpg 375w,
            /moving-truck-mobile.jpg 640w,
            /moving-truck.jpg"
        sizes="(max-width: 375px) 375px, 100%"
      />
      <p>Assign sizes prop</p>
    </div>
  )
}

export default Page
