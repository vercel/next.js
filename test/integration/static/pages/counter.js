import React from 'react'
import Link from 'next/link'

export default class Counter extends React.Component {
  constructor (...args) {
    super(...args)
    this.state = { count: 0 }
  }

  increaseCounter () {
    const { count } = this.state
    this.setState({ count: count + 1 })
  }

  render () {
    const { count } = this.state
    return (
      <div id='counter-page'>
        <div>
          <Link href='/'>
            <a>Go Back</a>
          </Link>
        </div>
        <p>Counter: {count}</p>
        <button
          id='counter-increase'
          onClick={() => this.increaseCounter()}
        >
          Increase
        </button>
      </div>
    )
  }
}
