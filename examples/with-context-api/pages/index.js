import React, { Component } from 'react'
/* First we import the consumer */
import { CounterConsumer } from '../components/CounterProvider'

export default class index extends Component {
  render () {
    return (
      /* Then we use our context through render props */
      <CounterConsumer>
        {({ count, increase, decrease }) => (
          <div>
            <p>Counter: {count}</p>
            <button onClick={increase}>Increase</button>
            <button onClick={decrease}>Decrease</button>
          </div>
        )}
      </CounterConsumer>
    )
  }
}
