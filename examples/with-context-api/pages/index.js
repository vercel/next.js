import React, { Component } from 'react'
import Link from 'next/link'
/* First we import the consumer */
import { CounterConsumer } from '../components/CounterProvider'

export default class index extends Component {
  render () {
    return (
      /* Then we use our context through render props */
      <CounterConsumer>
        {({ count, increase, decrease }) => (
          <div>
            <h1>HOME</h1>
            <p>Counter: {count}</p>
            <button onClick={increase}>Increase</button>
            <button onClick={decrease}>Decrease</button>
            <p><Link href='/about'>
              <a>About</a>
            </Link></p>
          </div>
        )}
      </CounterConsumer>
    )
  }
}
