'use client'

import Link from 'next/link'
import baseStyle from '../base2.module.css'
import baseStyle2 from '../base2-scss.module.scss'
import style from './style.module.css'

export default function Page() {
  return (
    <div>
      <p
        className={`${style.name} ${baseStyle.base} ${baseStyle2.base}`}
        id="hello2c"
      >
        hello world
      </p>
      <Link href={'/first'} id="first">
        First
      </Link>
      <Link href={'/first-client'} id="first-client">
        First client
      </Link>
      <Link href={'/second'} id="second">
        Second
      </Link>
      <Link href={'/second-client'} id="second-client">
        Second client
      </Link>
      <Link href={'/third'} id="third">
        Third
      </Link>
    </div>
  )
}
