import { useEffect, useState } from 'react'
import css from './index.module.css'

export default function Home() {
  const [state, setState] = useState('')
  useEffect(() => {
    setState('mounted')
  }, [])
  return (
    <main>
      <h1 id="red-title" className={css.headerRed}>
        Red
      </h1>
      <p>{state}</p>
    </main>
  )
}
