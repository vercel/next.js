import React from 'react'
import Image from 'next/image'

const ClientSide = () => {
  return (
    <div>
      <p id="stubtext">This is a client side page</p>
      <Image id="basic-image" src="foo.jpg"></Image>
      <Image id="attribute-test" data-demo="demo-value" src="bar.jpg" />
      <Image
        id="secondary-image"
        data-demo="demo-value"
        host="secondary"
        src="foo2.jpg"
      />
    </div>
  )
}

export default ClientSide
