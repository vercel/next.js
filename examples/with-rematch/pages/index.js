import React, { Component } from 'react'
import { store } from '../shared/store'
import withRematch from '../shared/utils/withRematch'
import Header from '../shared/components/header'

class Home extends Component {
  render () {
    return (
      <div>
        <Header />
        <h1> Counter </h1>
        <h3>The count is {this.props.counter}</h3>
        <p>
          <button onClick={this.props.increment}>increment</button>
          <button onClick={() => store.dispatch.counter.increment(1)}>
            increment (using dispatch function)
          </button>
          <button onClick={this.props.incrementBy(5)}>increment by 5</button>
          <button onClick={this.props.incrementAsync}>incrementAsync</button>
        </p>
        <br />
      </div>
    )
  }
}

const mapState = state => ({
  counter: state.counter
})

const mapDispatch = ({ counter: { increment, incrementAsync } }) => ({
  increment: () => increment(1),
  incrementBy: amount => () => increment(amount),
  incrementAsync: () => incrementAsync(1)
})

export default withRematch(store, mapState, mapDispatch)(Home)
