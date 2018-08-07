
import React, { Component } from 'react'

export default class Statefull extends Component {
  constructor (props) {
    super(props)

    this.state = { answer: null }
  }

  // eslint-disable-next-line camelcase
  UNSAFE_componentWillMount () {
    this.setState({ answer: 42 })
  }

  render () {
    return (
      <div>
        <p id='answer'>The answer is {this.state.answer}</p>
      </div>
    )
  }
}
