import { useCallback, useState } from 'react'
import styles from './ClickCount.module.css'

export default function ClickCount() {
  const [count, setCount] = useState(0)
  const increment = useCallback(() => {
    setCount(v => v + 1)
  }, [setCount])

  return (
    <button className={styles.btn} type="button" onClick={increment}>
      Clicks: {count}
    </button>
  )
}
