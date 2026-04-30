import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>Export Config</h1>
      <p>This page should error since you can't export images</p>
      <Image id="i" alt="i" src="/test.webp" width={200} height={200} />
    </div>
  )
}

export default Page
