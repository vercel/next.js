
import React, { Component } from 'react'

export default class Statefull extends Component {
  constructor (props) {
    super(props)

    this.state = { answer: null }
  }

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
