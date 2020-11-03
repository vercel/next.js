import React from 'react'
import Image from 'next/image'

const Invalid = () => {
  return (
    <div>
      <Image src="https://via.invalid.com/500" width={500} height={500} />
      <p id="stubtext">This is a page with errors</p>
    </div>
  )
}

export default Invalid
