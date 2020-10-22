import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image
        id="basic-image"
        src="foo.jpg"
        lazy={false}
        width={300}
        height={400}
        quality={60}
      ></Image>
      <Image
        id="attribute-test"
        data-demo="demo-value"
        src="bar.jpg"
        lazy={false}
        width={300}
        height={400}
      />
      <Image
        id="secondary-image"
        data-demo="demo-value"
        host="secondary"
        src="foo2.jpg"
        lazy={false}
        width={300}
        height={400}
      />
      <Image
        id="unoptimized-image"
        unoptimized
        src="https://arbitraryurl.com/foo.jpg"
        lazy={false}
        width={300}
        height={400}
      />
      <Image id="priority-image" priority src="withpriority.png" />
      <Image
        id="priority-image"
        priority
        host="secondary"
        src="withpriority2.png"
        width={300}
        height={400}
      />
      <Image
        id="priority-image"
        priority
        unoptimized
        src="https://arbitraryurl.com/withpriority3.png"
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
      <Link href="/client-side">
        <a id="clientlink">Client Side</a>
      </Link>
      <Link href="/lazy">
        <a id="lazylink">lazy</a>
      </Link>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
