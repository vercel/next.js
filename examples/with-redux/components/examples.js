import { useSelector, shallowEqual } from 'react-redux'
import Clock from './clock'
import Counter from './counter'

const clockSelector = state => ({
  lastUpdate: state.lastUpdate,
  light: state.light
})

function Examples () {
  const { lastUpdate, light } = useSelector(clockSelector, shallowEqual)
  return (
    <div>
      <Clock lastUpdate={lastUpdate} light={light} />
      <Counter />
    </div>
  )
}

export default Examples
