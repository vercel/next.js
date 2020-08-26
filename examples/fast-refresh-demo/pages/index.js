import { useCallback, useEffect, useState } from 'react'
import ClickCount from '../components/ClickCount'
import styles from '../components/ClickCount.module.css'

function throwError() {
  console.log(
    // The function body() is not defined
    document.body()
  )
}

function Home() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => {
    setCount((v) => v + 1)
  }, [setCount])

  useEffect(() => {
    const r = setInterval(() => {
      increment()
    }, 1000)
    return () => {
      clearInterval(r)
    }
  }, [increment])

  return (
    <main>
      <h1>Home</h1>
      <div>
        <p>Auto Incrementing Value</p>
        <p>Current value: {count}</p>
      </div>
      <hr />
      <div>
        <p>Component with State</p>
        <ClickCount />
      </div>
      <hr />
      <div>
        <button
          className={styles.btn}
          type="button"
          onClick={(e) => {
            setTimeout(() => document.parentNode(), 0)
            throwError()
          }}
        >
          Throw an Error
        </button>
      </div>
    </main>
  )
}

export default Home
