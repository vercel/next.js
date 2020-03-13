import React, { useEffect, FC } from 'react'
import Link from 'next/link'
import { useObserver } from 'mobx-react-lite'

import { useStore } from '../store'
import { Clock } from './Clock'

interface Props {
  linkTo: string
}

export const Sample: FC<Props> = props => {
  const store = useStore()

  useEffect(() => {
    store.start()
    return () => store.stop()
  }, [store])

  return (
    <div>
      <h1>Clock</h1>

      {useObserver(() => (
        <Clock lastUpdate={store.lastUpdate} light={store.light} />
      ))}
      <nav>
        <Link href={props.linkTo}>
          <a>Navigate</a>
        </Link>
      </nav>
    </div>
  )
}
