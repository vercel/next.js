import React, { Component } from 'react'
import Page from '../components/Page'

import * as indent from '../lib/indent'

export default class extends Component {
  state = { sessionId: '' }

  handleInput = e => {
    this.setState({ sessionId: e.target.value })
  }

  handleSubmit = e => {
    e.preventDefault()

    if (!window.localStorage['$viewer.email']) {
      let email = prompt(`What's your email?`)

      if (!email) {
        return
      }

      indent.setActor({ email })
      window.localStorage['$viewer.email'] = email
    } else {
      indent.setActor({ email: window.localStorage['$viewer.email'] })
    }

    let { sessionId } = this.state

    indent.write({
      event: 'session/find',
      resources: [{
        id: sessionId,
        kind: 'session/id'
      }]
    })

    this.setState({ sessionId: '' })
  }

  render() {
    return (
      <Page>
        <h1>Find a session</h1>
        <form onSubmit={this.handleSubmit}>
          <label>
            <span>Session ID:</span>
            <input onChange={this.handleInput} value={this.state.sessionId} />
          </label>
          <button type="submit">submit</button>
        </form>
      </Page>
    )
  }
}
