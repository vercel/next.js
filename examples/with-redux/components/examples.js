import { connect } from 'react-redux'
import Clock from './clock'
import Counter from './counter'

function Examples ({ lastUpdate, light }) {
  return (
    <div>
      <Clock lastUpdate={lastUpdate} light={light} />
      <Counter />
    </div>
  )
}

function mapStateToProps (state) {
  const { lastUpdate, light } = state
  return { lastUpdate, light }
}

export default connect(mapStateToProps)(Examples)
