import React from 'react'
import Image from 'next/image'
import style from '../../style.module.css'

const Page = () => {
  return (
    <div id="main-container" className={style.mainContainer}>
      <h1>Image Style Inheritance</h1>
      <Image id="img-fixed" src="/test.jpg" width="400" height="400" />

      <Image id="img-intrinsic" src="/test.jpg" width="400" height="400" />

      <Image
        id="img-fill"
        width={200}
        height={200}
        src="/test.jpg"
        fill
        style={{ objectFit: 'cover' }}
      />

      <Image
        id="img-responsive"
        src="/test.jpg"
        width="400"
        height="400"
        sizes="100vw"
      />

      <footer>Footer</footer>
    </div>
  )
}

export default Page
