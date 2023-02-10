import React from 'react'
import Image from 'next/legacy/image'

const Lazy = () => {
  return (
    <div>
      <p id="stubtext">This is a page with lazy-loaded images</p>
      <Image
        id="lazy-top"
        src="lazy1.jpg"
        height={400}
        width={1024}
        loading="lazy"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-mid"
        src="lazy2.jpg"
        loading="lazy"
        height={400}
        width={300}
        className="exampleclass"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-bottom"
        src="https://www.otherhost.com/lazy3.jpg"
        height={400}
        width={300}
        unoptimized
        loading="lazy"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-without-attribute"
        src="lazy4.jpg"
        height={400}
        width={800}
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="eager-loading"
        src="lazy5.jpg"
        loading="eager"
        height={400}
        width={1900}
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-boundary"
        src="lazy6.jpg"
        height={400}
        width={800}
        lazyBoundary="0px 0px 500px 0px"
      ></Image>
    </div>
  )
}

export default Lazy
