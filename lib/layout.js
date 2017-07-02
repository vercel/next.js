import React from 'react'

export default class Layout extends React.Component {
  render () {
    return (<div>
      {this.props.children}
    </div>)
  }
}
