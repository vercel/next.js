import { useObserver } from 'mobx-react-lite'
import Link from 'next/link'
import { useContext, useEffect } from 'react'
import { StoreContext, start, stop } from '../store'
import Clock from './Clock'

function Page ({ linkTo, title }) {
  const store = useContext(StoreContext)

  useEffect(() => {
    start()
    return stop
  }, [])

  return <div>
    <h1>{title}</h1>
    {useObserver(() => <Clock
      lastUpdate={store.lastUpdate}
      light={store.light}
    />)}
    <nav>
      <Link href={linkTo}>
        <a>Navigate</a>
      </Link>
    </nav>
  </div>
}

export default Page
