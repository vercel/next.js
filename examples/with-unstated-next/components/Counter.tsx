import { NextComponentType } from 'next'
import React from 'react'
import { CounterStore } from '../store'

export const Counter: NextComponentType = (props) => {
  console.log('counter component', { props })
  const counter = CounterStore.useContainer()
  return (
    <div>
      <button onClick={counter.decrement}>-</button>
      <span>{counter.count}</span>
      <button onClick={counter.increment}>+</button>
    </div>
  )
}
