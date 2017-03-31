import { Component } from 'react'
import Router from 'next/router'

export default class About extends Component {
  constructor (props) {
    super(props)
    this.state = {}
  }

  render () {
    return (
      <div>
        <h2>About Me</h2>
        <a onClick={() => Router.push('/')}>Go Back to Index</a>
      </div>
    )
  }
}
