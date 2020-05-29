import React from 'react'
import { useSelector } from 'react-redux'
import { useRematchDispatch } from '../utils'

const CounterDisplay = () => {
  const counter = useSelector((state) => state.counter)
  const { increment } = useRematchDispatch((dispatch) => ({
    increment: dispatch.counter.increment,
  }))
  return (
    <>
      <h3> Counter </h3>
      <p>
        This counter is connected via the <b>useSelector</b> hook. Components
        which are not pages can be connected using the useSelector hook just
        like redux components.
      </p>
      <p>Current value {counter}</p>
      <p>
        <button onClick={() => increment(3)}>Increment by 3</button>
      </p>
    </>
  )
}

export default CounterDisplay
