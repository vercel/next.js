import { useSelector } from 'react-redux'
import Clock from './clock'
import Counter from './counter'
import DataList from './data-list'

const Examples = () => {
  const lastUpdate = useSelector((state) => state.lastUpdate)
  const light = useSelector((state) => state.light)
  return (
    <div>
      <Clock lastUpdate={lastUpdate} light={light} />
      <Counter />
      <DataList />
    </div>
  )
}

export default Examples
