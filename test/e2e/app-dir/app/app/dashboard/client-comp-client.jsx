'use client'

import styles from './client-comp.module.css'

import { useEffect, useState } from 'react'

export default function ClientComp() {
  const [state, setState] = useState({})
  useEffect(() => {
    setState({ test: 'HELLOOOO' })
  }, [])
  return (
    <>
      <p className={styles.client}>Hello</p>
      {state.test}
    </>
  )
}
