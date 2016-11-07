import React, { Component } from 'react'

export default class CatchAll extends Component {
  constructor (props) {
    super(props)

    let routeParts = this.props.url.pathname.split('/')
    this.state = { user_id: parseInt(routeParts[(routeParts.length - 1)]) }
  }

  render () {
    return <div>
      <p>user id: {this.state.user_id}</p>
    </div>
  }
}
