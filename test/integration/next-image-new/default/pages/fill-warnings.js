import React from 'react'
import Image from 'next/image'

const Page = () => {
  return (
    <div>
      <h1>Fill Mode</h1>
      <div
        id="image-container-1"
        style={{
          height: '300px',
          width: '300px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Image id="fill-image-1" src="/wide.png" fill />
      </div>
      <div id="image-container-2">
        <Image id="fill-image-2" src="/wide.png" fill />
      </div>
      <div
        id="image-container-3"
        style={{
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Image id="fill-image-3" src="/wide.png" fill />
      </div>
    </div>
  )
}

export default Page
