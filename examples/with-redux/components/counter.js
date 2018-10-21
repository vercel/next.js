import React, { Component } from 'react'
import { connect } from 'react-redux'
import { incrementCount, decrementCount, resetCount } from '../store'

class Counter extends Component {
  increment = () => {
    const { dispatch } = this.props
    dispatch(incrementCount())
  }

  decrement = () => {
    const { dispatch } = this.props
    dispatch(decrementCount())
  }

  reset = () => {
    const { dispatch } = this.props
    dispatch(resetCount())
  }

  render () {
    const { count } = this.props
    return (
      <div>
        <h1>
          Count: <span>{count}</span>
        </h1>
        <button onClick={this.increment}>+1</button>
        <button onClick={this.decrement}>-1</button>
        <button onClick={this.reset}>Reset</button>
      </div>
    )
  }
}

function mapStateToProps (state) {
  const { count } = state
  return { count }
}

export default connect(mapStateToProps)(Counter)
