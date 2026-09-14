import React from 'react'
import Image from 'next/legacy/image'
import img from '../public/test.jpg'
import style from '../style.module.css'

const Page = () => {
  return (
    <div className={style.displayFlex}>
      <Image id="img" layout="responsive" src={img} />
    </div>
  )
}

export default Page
