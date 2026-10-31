import React from 'react'
import Image from 'next/legacy/image'
import style from '../style.module.css'

const Page = () => {
  return (
    <div id="main-container" className={style.mainContainer}>
      <h1>Image Style Inheritance</h1>
      <Image
        id="img-fixed"
        layout="fixed"
        src="/test.jpg"
        width="400"
        height="400"
      />

      <Image
        id="img-intrinsic"
        layout="intrinsic"
        src="/test.jpg"
        width="400"
        height="400"
      />

      <div style={{ position: 'relative', width: '200px', height: '200px' }}>
        <Image id="img-fill" layout="fill" src="/test.jpg" objectFit="cover" />
      </div>

      <Image
        id="img-responsive"
        layout="responsive"
        src="/test.jpg"
        width="400"
        height="400"
      />

      <footer>Footer</footer>
    </div>
  )
}

export default Page
