import { connect } from 'react-redux'
import Clock from './clock'
import Counter from './counter'
import DataList from './data-list'

function Examples({ lastUpdate, light }) {
  return (
    <div>
      <Clock lastUpdate={lastUpdate} light={light} />
      <Counter />
      <DataList />
    </div>
  )
}

function mapStateToProps(state) {
  const { lastUpdate, light } = state
  return { lastUpdate, light }
}

export default connect(mapStateToProps)(Examples)
