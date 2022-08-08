import React from 'react'
import Image from 'next/future/image'

const Invalid = () => {
  return (
    <div>
      <h1>Invalid TS</h1>
      <Image id="invalid-src" src={new Date()} width={500} height={500}></Image>
      <Image
        id="invalid-width"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={new Date()}
        height={500}
      ></Image>
      <Image
        id="invalid-placeholder"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width="500"
        height="500"
        placeholder="invalid"
      ></Image>
      <p id="stubtext">This is the invalid usage</p>
    </div>
  )
}

export default Invalid
