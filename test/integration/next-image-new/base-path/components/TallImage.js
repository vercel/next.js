import React from 'react'
import Image from 'next/image'

import testTall from './tall.png'

const Page = () => {
  return (
    <div>
      <h1 id="page-header">Static Image</h1>
      <Image
        id="basic-static"
        src={testTall}
        layout="fixed"
        placeholder="blur"
      />
    </div>
  )
}

export default Page
