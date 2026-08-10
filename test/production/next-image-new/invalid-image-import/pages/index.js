import React from 'react'
import Image from 'next/image'
import test from '../public/invalid.svg'

const Page = () => {
  return (
    <div>
      <h1>Try to import and invalid image file</h1>
      <Image id="invalid-img" src={test} width={400} height={400} />
    </div>
  )
}

export default Page
