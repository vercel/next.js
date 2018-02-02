import React, { Component } from 'react'

export default class extends Component {
  static getInitialProps ({ res }) {
    res.end('hi')
  }

  render () {
    return <div>hi</div>
  }
}
