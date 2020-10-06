import React from '../integration/image-component/basic/pages/react'
import Image from '../integration/image-component/basic/pages/next/image'
import Link from '../integration/image-component/basic/pages/next/link'

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
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
      />
      <Image id="priority-image-client" priority src="withpriorityclient.png" />
      <Link href="/errors">
        <a id="errorslink">Errors</a>
      </Link>
    </div>
  )
}

export default ClientSide
