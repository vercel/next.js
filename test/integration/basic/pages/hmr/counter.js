import React from 'react'

export default class Counter extends React.Component {
  state = { count: 0 }

  incr () {
    const { count } = this.state
    this.setState({ count: count + 1 })
  }

  render () {
    return (
      <div>
        <p>COUNT: {this.state.count}</p>
        <button onClick={() => this.incr()}>Increment</button>
      </div>
    )
  }
}
