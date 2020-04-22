import React from 'react'
import { useSelector } from 'react-redux'
import Clock from './clock'
import Counter from './counter'

const Examples = () => {
  const lastUpdate = useSelector(state => state.timer.lastUpdate)
  const light = useSelector(state => state.timer.light)

  return (
    <div style={{ marginBottom: 10 }}>
      <Clock lastUpdate={lastUpdate} light={light} />
      <Counter />
    </div>
  )
}

export default Examples
