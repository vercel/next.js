import React from 'react'
import Image from 'next/image'

const Lazy = () => {
  return (
    <div>
      <p id="stubtext">This is a page with lazy-loaded images</p>
      <Image
        id="lazy-top"
        src="foo1.jpg"
        height="400px"
        width="300px"
        lazy
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-mid"
        src="foo2.jpg"
        lazy
        height="400px"
        width="300px"
        className="exampleclass"
      ></Image>
      <div style={{ height: '2000px' }}></div>
      <Image
        id="lazy-bottom"
        src="https://www.otherhost.com/foo3.jpg"
        height="400px"
        width="300px"
        unoptimized
        lazy
      ></Image>
    </div>
  )
}

export default Lazy
