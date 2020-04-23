import React from 'react'
import Link from 'next/link'

let counter = 0

export default class Counter extends React.Component {
  increaseCounter() {
    counter++
    this.forceUpdate()
  }

  render() {
    return (
      <div id="counter-page">
        <div>
          <Link href="/">
            <a id="go-back">Go Back</a>
          </Link>
        </div>
        <p>Counter: {counter}</p>
        <button id="counter-increase" onClick={() => this.increaseCounter()}>
          Increase
        </button>
      </div>
    )
  }
}
