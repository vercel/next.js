import React, { useEffect } from 'react'
import { observer } from 'mobx-react-lite'
import Link from 'next/link'
import { IStore, useStore } from '../store'
import Clock from './Clock'

interface IOwnProps {
  store?: IStore
  title: string
  linkTo: string
}

const SampleComponent: React.FC<IOwnProps> = observer((props) => {
  const { lastUpdate, light, start, stop } = useStore(props.store)

  useEffect(() => {
    start()
    return () => {
      stop()
    }
  }, [start, stop])

  return (
    <div>
      <h1>{props.title}</h1>
      <Clock lastUpdate={lastUpdate} light={light} />
      <nav>
        <Link href={props.linkTo}>Navigate</Link>
      </nav>
    </div>
  )
})

export default SampleComponent
