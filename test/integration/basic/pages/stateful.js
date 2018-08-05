
import React, { Component } from 'react'

export default class Statefull extends Component {
  constructor (props) {
    super(props)

    this.state = { answer: null }
  }

  static getDerivedStateFromProps (nextProps, prevState) {
    if (!prevState.answer) {
      return {answer: 42}
    }
  }

  render () {
    return (
      <div>
        <p id='answer'>The answer is {this.state.answer}</p>
      </div>
    )
  }
}
