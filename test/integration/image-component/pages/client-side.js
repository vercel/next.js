import React from 'react'
import Image from 'next/image'

const ClientSide = () => {
  return (
    <div>
      <p id="stubtext">This is a client side page</p>
      <Image src="foo.jpg"></Image>
    </div>
  )
}

export default ClientSide
