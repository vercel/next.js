import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const ClientSide = () => {
  return (
    <div>
      <p id="stubtext">This is a client side page</p>
      <Image
        id="basic-image"
        src="foo.jpg"
        loading="eager"
        width={300}
        height={400}
        quality={60}
      ></Image>
      <Image
        id="attribute-test"
        data-demo="demo-value"
        src="bar.jpg"
        loading="eager"
        width={300}
        height={400}
      />
      <Image
        id="secondary-image"
        data-demo="demo-value"
        host="secondary"
        src="foo2.jpg"
        loading="eager"
        width={300}
        height={400}
      />
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
        loading="eager"
        width={300}
        height={400}
      />
      <Image
        id="priority-image-client"
        priority
        src="withpriorityclient.png"
        width={300}
        height={400}
      />
      <Image
        id="preceding-slash-image"
        src="/fooslash.jpg"
        priority
        width={300}
        height={400}
      />
      <Image
        id="icon-image-32"
        src="/icon.png"
        loading="eager"
        width={32}
        height={32}
      />
      <Image
        id="icon-image-16"
        src="/icon.png"
        loading="eager"
        width={16}
        height={16}
      />
      <Link href="/errors">
        <a id="errorslink">Errors</a>
      </Link>
    </div>
  )
}

export default ClientSide
