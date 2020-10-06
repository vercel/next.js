import Link from 'next/link'
import { useState } from 'react'
import { useEffect } from 'react'

const Counter = ({ initialCount }) => {
  const [count, setCount] = useState(initialCount || 0)

  useEffect(() => {
    window.__store__ = {
      count: initialCount,
    }
    setCount(initialCount)
  }, [initialCount])

  const setCountWithStore = (count) => {
    window.__store__ = {
      count,
    }
    setCount(count)
  }

  const handleClickIncrease = () => {
    const count = window?.__store__?.count || 0
    setCountWithStore(count + 1)
  }

  const handleClickDecrease = () => {
    const count = window?.__store__?.count || 0
    setCountWithStore(count - 1)
  }

  return (
    <div>
      <h2>
        Count: <span>{count}</span>
      </h2>
      <button onClick={handleClickIncrease}>Increase count</button>
      <button onClick={handleClickDecrease}>Decrase count</button>
      <ul>
        <li>
          <Link href="/">
            <a>Index(SSR)</a>
          </Link>
        </li>
        <li>
          <Link href="/a">
            <a>Page a(SSR)</a>
          </Link>
        </li>
        <li>
          <Link href="/b">
            <a>Page b(SSR)</a>
          </Link>
        </li>
      </ul>
    </div>
  )
}

export default Counter
