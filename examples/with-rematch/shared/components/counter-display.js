import React, { Component } from 'react'
import { connect } from 'react-redux'

class CounterDisplay extends Component {
  render () {
    return (
      <div>
        <h3> Counter </h3>
        <p>
          This counter is connected via the <b>connect</b> function. Components
          which are not pages can be connected using the connect function just
          like redux components.
        </p>
        <p>Current value {this.props.counter} </p>
        <p>
          <button onClick={this.props.incrementBy3}>Increment</button>
        </p>
      </div>
    )
  }
}

const mapState = state => ({
  counter: state.counter
})

const mapDispatch = ({ counter: { increment, incrementAsync } }) => ({
  incrementBy3: () => increment(3)
})

export default connect(
  mapState,
  mapDispatch
)(CounterDisplay)
