import React, { Component } from 'react'

import '../styles.css'

export default class extends Component {
  constructor(props) {
    super(props)

    this.state = {
      mounted: false,
    }
  }

  componentDidMount() {
    this.setState({ mounted: true })
  }

  render() {
    return (
      <p id="mounted">
        ComponentDidMount{' '}
        {this.state.mounted ? 'executed on client' : 'not executed'}.
      </p>
    )
  }
}
