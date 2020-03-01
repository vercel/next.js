import { useSelector } from 'react-redux'
import Clock from './clock'
import Counter from './counter'

export default () => {
  const lastUpdate = useSelector(state => state.lastUpdate)
  const light = useSelector(state => state.light)

  return (
    <div>
      <Clock lastUpdate={lastUpdate} light={light} />
      <Counter />
    </div>
  )
}
