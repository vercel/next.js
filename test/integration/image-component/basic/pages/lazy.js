import React from 'react'
import Image from 'next/image'
import Link from 'next/link'

const Lazy = () => {
  return (
    <div>
      <p id="stubtext">This is a page with lazy-loaded images</p>
      <Image
        id="lazy-top"
        src="foo1.jpg"
        height={400}
        width={1024}
        loading="lazy"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-mid"
        src="foo2.jpg"
        loading="lazy"
        height={400}
        width={300}
        className="exampleclass"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-bottom"
        src="https://www.otherhost.com/foo3.jpg"
        height={400}
        width={300}
        unoptimized
        loading="lazy"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-without-attribute"
        src="foo4.jpg"
        height={400}
        width={800}
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="eager-loading"
        src="foo5.jpg"
        loading="eager"
        height={400}
        width={1900}
      ></Image>
      <Link href="/missing-observer">
        <a id="observerlink">observer</a>
      </Link>
    </div>
  )
}

export default Lazy
