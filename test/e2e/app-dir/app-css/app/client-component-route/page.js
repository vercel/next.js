'use client'

import { useState, useEffect } from 'react'

import style from './style.module.css'
import './style.css'

export default function ClientComponentRoute() {
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(1)
  }, [count])
  return (
    <>
      <p className={style.red}>
        hello from app/client-component-route. <b>count: {count}</b>
      </p>
    </>
  )
}
