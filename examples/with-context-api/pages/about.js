import React, { Component } from 'react'
/* First we import the consumer */
import { CounterConsumer } from '../components/CounterProvider'
import Link from 'next/link'

export default class about extends Component {
  render () {
    return (
      /* Then we use our context through render props */
      <CounterConsumer>
        {({ count, increase, increaseBy }) => (
          <div>
            <h1>ABOUT</h1>
            <p>Counter: {count}</p>
            <button onClick={increase}>Increase</button>
            <button
              onClick={() => {
                increaseBy(15)
              }}
            >
              Increase By 15
            </button>
            <p>
              <Link href='/'>
                <a>Home</a>
              </Link>
            </p>
          </div>
        )}
      </CounterConsumer>
    )
  }
}
