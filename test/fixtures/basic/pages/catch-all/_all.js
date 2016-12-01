import React, { Component } from 'react'

export default class CatchAll extends Component {
  constructor (props) {
    super(props)

    this.state = { user_id: parseInt(this.props.url.pathname.split('/').pop()) }
  }

  render () {
    return <div>
      <p>user id: {this.state.user_id}</p>
    </div>
  }
}
