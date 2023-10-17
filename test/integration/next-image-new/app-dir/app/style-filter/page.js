import React from 'react'
import Image from 'next/image'
import style from '../../style.module.css'
import img from '../../public/test.jpg'

const Page = () => {
  return (
    <div>
      <h1>Image Style Filter</h1>

      <Image
        className={style.overrideImg}
        id="img-plain"
        src="/test.jpg"
        width={400}
        height={400}
      />

      <Image
        className={style.overrideImg}
        id="img-blur"
        placeholder="blur"
        src={img}
      />

      <footer>Footer</footer>
    </div>
  )
}

export default Page
