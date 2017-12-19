import React from 'react'

export default class AppLayout extends React.Component {
  render () {
    return (
      <div>
        <h1>App header</h1>
        {this.props.children}
      </div>
    )
  }
}
