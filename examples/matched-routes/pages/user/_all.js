import React, { Component } from 'react'
import Link from 'next/link'

export default class CatchAll extends Component {
  constructor (props) {
    super(props)

    this.state = { user_id: parseInt(this.props.url.pathname.split('/').pop()) }
  }

  render () {
    return <div>
      <p>user_id: {this.state.user_id}</p>
      <Link href={'/'}>Back</Link>
    </div>
  }
}
