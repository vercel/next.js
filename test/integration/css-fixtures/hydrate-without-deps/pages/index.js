import { useEffect, useState } from 'react'
import css from './index.module.css'

export default function Home() {
  const [state, setState] = useState('')
  useEffect(() => {
    setState('mounted')
  }, [])
  return (
    <main>
      <h1 id="black-title" className={css.header}>
        Black
      </h1>
      <p>{state}</p>
    </main>
  )
}
