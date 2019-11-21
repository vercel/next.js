import React, { Component } from 'react'

class BuggyCounter extends Component {
  state = {
    counter: 0,
  }

  handleClick = () => {
    this.setState(({ counter }) => ({
      counter: counter + 1,
    }))
  }

  render() {
    if (this.state.counter === 5) {
      // Simulate a JS error
      throw new Error('I crashed!')
    }

    return <h1 onClick={this.handleClick}>{this.state.counter}</h1>
  }
}

export default () => (
  <div>
    <p>Click on the number to increase the counter.</p>
    <p>The counter is programmed to throw an error when it reaches 5.</p>
    <BuggyCounter />
  </div>
)
