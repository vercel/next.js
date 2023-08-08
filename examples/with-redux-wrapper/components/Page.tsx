import Link from 'next/link'
import { useSelector } from 'react-redux'
import Clock from './Clock'
import AddCount from './AddCount'
import { RootState } from '../store/store'

interface Props {
  title: string
  linkTo: string
}

export default function Page({ title, linkTo }: Props) {
  const tick = useSelector((state: RootState) => state.tick)

  return (
    <div>
      <h1>{title}</h1>
      <Clock lastUpdate={tick.lastUpdate} light={tick.light} />
      <AddCount />
      <nav>
        <Link href={linkTo}>Navigate</Link>
      </nav>
    </div>
  )
}
