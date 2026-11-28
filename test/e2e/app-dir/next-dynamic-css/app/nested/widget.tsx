'use client'

import dynamic from 'next/dynamic'
import styles from './widget.module.css'

const Variant = dynamic(() => import('./variant'))

export default function Widget() {
  return (
    <section id="widget" className={styles.widget}>
      <Variant />
    </section>
  )
}
