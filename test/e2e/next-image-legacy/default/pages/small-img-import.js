import React from 'react'
import Image from 'next/legacy/image'
import Small from '../public/small.jpg'

const Page = () => {
  return (
    <div>
      <Image id="small-img-import" src={Small} placeholder="blur" />
    </div>
  )
}

export default Page
