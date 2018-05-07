
import { connect } from 'react-redux'
import Clock from './Clock'
import AddCount from './AddCount'

export default connect(state => state)(({ title, lastUpdate, light }) => {
  return (
    <div>
      <h1>{title}</h1>
      <Clock lastUpdate={lastUpdate} light={light} />
      <AddCount />
    </div>
  )
})
