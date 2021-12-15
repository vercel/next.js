import React from 'react'
import Link from 'next/link'
import cx from 'classnames'
import styles from './Banner.module.css'

const Banner = ({ id, className, href }) => {
  return (
    <div id={`hero-${id}`} className={cx(styles.Banner, className)}>
      <h1 style={{ margin: 0, padding: '2rem' }}>This is a test</h1>

      <Link href={href}>
        <a id={`link-${id}`} style={{ margin: 0, padding: '2rem' }}>
          Other Page
        </a>
      </Link>
    </div>
  )
}

export default Banner
