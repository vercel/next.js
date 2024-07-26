'use client'

import base from './base.module.css'
import styles from './inner2.module.css'

export default async function Inner2() {
  if (typeof window === 'undefined') {
    throw new Error('Expected error to opt out of server rendering')
  }
  return (
    <p id="inner2" className={`global-class ${base.class} ${styles.class}`}>
      Hello Inner 2
    </p>
  )
}
