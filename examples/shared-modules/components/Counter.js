import React from 'react'

let count = 0

export default class Counter extends React.Component {
  add() {
    count += 1
    this.forceUpdate()
  }

  render() {
    return (
      <div>
        <p>Count is: {count}</p>
        <button onClick={() => this.add()}>Add</button>
      </div>
    )
  }
}
