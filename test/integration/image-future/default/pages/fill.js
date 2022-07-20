import React from 'react'
import Image from 'next/future/image'

const Page = () => {
  return (
    <div>
      <h1>Fill Mode</h1>
      <div id="image-container-1" style={{ height: '300', width: '300' }}>
        <Image id="fill-image-1" src="/wide.png" fill />
      </div>
    </div>
  )
}

export default Page
