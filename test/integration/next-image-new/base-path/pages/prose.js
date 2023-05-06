import Image from 'next/image'
import React from 'react'
import * as styles from './prose.module.css'

const Page = () => {
  return (
    <div className={styles.prose}>
      <p>Hello World</p>
      <Image
        id="prose-image"
        src="/docs/test.jpg"
        width="400"
        height="400"
      ></Image>
      <p id="stubtext">This is the rotated page</p>
    </div>
  )
}

export default Page
