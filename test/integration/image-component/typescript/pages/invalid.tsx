import React from 'react'
import Image from 'next/image'

const Invalid = () => {
  return (
    <div>
      <h1>Hello World</h1>
      <Image
        id="no-width-or-height"
        src="https://via.placeholder.com/500"
      ></Image>
      <p id="stubtext">This is the invalid usage</p>
    </div>
  )
}

export default Invalid
