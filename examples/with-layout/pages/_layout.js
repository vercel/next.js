import React, { Component } from 'react'

export default class TestLayout extends Component {
  render () {
    return <div>
      <h1>This part will never remount</h1>
      <p>Using this allows you to add persistent elements such as Alerts, Transitions, etc..</p>
      {this.props.children}
    </div>
  }
}
