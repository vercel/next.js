import React from 'react'
import Image from 'next/image'

const Invalid = () => {
  return (
    <div>
      <h1>Invalid TS</h1>
      <Image
        width={500}
        height={500}
        src="https://via.placeholder.com/500"
        style={{ objectFit: 'cover' }}
      ></Image>
      <p id="stubtext">This is the invalid usage</p>
    </div>
  )
}

export default Invalid
