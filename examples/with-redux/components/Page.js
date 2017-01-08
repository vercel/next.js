import Link from 'next/link'
import { connect } from 'react-redux'
import Clock from './Clock'

export default connect(state => state)(({ title, linkTo, lastUpdate, light }) => {
  return (
    <div>
      <h1>{title}</h1>
      <Clock lastUpdate={lastUpdate} light={light} />
      <nav>
        <Link href={linkTo}>Navigate</Link>
      </nav>
    </div>
  )
})
