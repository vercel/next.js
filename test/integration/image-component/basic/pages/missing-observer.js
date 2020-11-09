import React, { useLayoutEffect } from 'react'
import Image from 'next/image'

const Lazy = () => {
  useLayoutEffect(() => {
    IntersectionObserver = null //eslint-disable-line
  })
  return (
    <div>
      <p id="stubtext">
        This is a page with one lazy-loaded image, to be used in the test for
        browsers without intersection observer.
      </p>
      <Image
        id="lazy-no-observer"
        src="foox.jpg"
        height={400}
        width={1024}
        loading="lazy"
      ></Image>
    </div>
  )
}

export default Lazy
