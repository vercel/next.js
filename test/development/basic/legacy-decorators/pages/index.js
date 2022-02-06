import React from 'react'
import { makeAutoObservable } from 'mobx'
import { observer } from 'mobx-react'

class Counter {
  count = 0

  constructor() {
    makeAutoObservable(this)
  }

  increase() {
    this.count += 1
  }
}

const myCounter = new Counter()

@observer
class CounterView extends React.Component {
  render() {
    return (
      <>
        <span id="count">Current number: {this.props.counter.count}</span>
        <button id="increase" onClick={() => this.props.counter.increase()}>
          Increase
        </button>
      </>
    )
  }
}

export default function Home() {
  return <CounterView counter={myCounter} />
}
