import React from 'react'
import Image from 'next/image'

const Invalid = () => {
  return (
    <div>
      <h1>Invalid TS</h1>
      <Image id="invalid-src" src={new Date()} width={500} height={500}></Image>
      <Image
        id="invalid-width"
        src="https://via.placeholder.com/500"
        width={new Date()}
        height={500}
      ></Image>
      <Image
        id="invalid-layout"
        src="https://via.placeholder.com/500"
        width="500"
        height="500"
        layout="invalid"
      ></Image>
      <Image
        id="invalid-placeholder"
        src="https://via.placeholder.com/500"
        width="500"
        height="500"
        placeholder="invalid"
      ></Image>
      <p id="stubtext">This is the invalid usage</p>
    </div>
  )
}

export default Invalid
