
import React, { Component } from 'react'

export default class Statefull extends Component {
  static getInitialProps (ctx) {
    return ctx
  }

  render () {
    return <div>
      <p>The route parameter `id` is {this.props.params.id}</p>
    </div>
  }
}
