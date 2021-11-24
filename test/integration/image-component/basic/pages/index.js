import React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import Head from 'next/head'

const Page = () => {
  return (
    <div>
      <p>Hello World</p>
      <Image
        id="image-with-sizes"
        src="/test-sizes.jpg"
        width={2000}
        height={100}
        sizes="100vw"
      />
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
        width={1024}
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
        id="priority-image"
        priority
        src="withpriority.png"
        width={300}
        height={400}
        quality={60}
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
      <Link href="/client-side">
        <a id="clientlink">Client Side</a>
      </Link>
      <Link href="/lazy">
        <a id="lazylink">lazy</a>
      </Link>
      <Head>
        <link rel="stylesheet" href="styles.css" />
        <link rel="preload" href="styles.css" as="style" />
      </Head>
      <p id="stubtext">This is the index page</p>
    </div>
  )
}

export default Page
