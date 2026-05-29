import React from 'react'
import Image from 'next/image'

const Invalid = () => {
  return (
    <div>
      <h1>Invalid TS</h1>
      <Image
        id="invalid-src"
        alt="invalid-src"
        src={new Date()}
        width={500}
        height={500}
      />
      <Image
        id="invalid-width"
        alt="invalid-width"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={new Date()}
        height={500}
      />
      <Image
        id="invalid-placeholder"
        alt="invalid-placeholder"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width="500"
        height="500"
        placeholder="invalid"
      />
      <Image
        id="invalid-width-string-type"
        alt="invalid-width-string-type"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width="500foo"
      />
      <Image
        id="invalid-height-string-type"
        alt="invalid-height-string-type"
        src="https://image-optimization-test.vercel.app/test.jpg"
        height="500bar"
      />
      <Image
        id="invalid-quality-string-type"
        alt="invalid-quality-string-type"
        src="https://image-optimization-test.vercel.app/test.jpg"
        quality="500baz"
      />
      <Image
        id="missing-alt"
        src="https://image-optimization-test.vercel.app/test.jpg"
        width={500}
        height={500}
      />
      <Image id="missing-src" alt="missing-src" width={500} height={500} />
      <Image id="null-src" alt="null-src" src={null} width={500} height={500} />
      <p id="stubtext">This is the invalid usage</p>
    </div>
  )
}

export default Invalid
