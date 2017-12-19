import React from 'react'
import AppLayout from './AppLayout'

export default class ContentLayout extends React.Component {
  static parentLayout = AppLayout

  render () {
    return (
      <div>
        <hr />
        {this.props.children}
        <hr />
      </div>
    )
  }
}
