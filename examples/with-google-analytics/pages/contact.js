import React, { Component } from 'react'
import Page from '../components/Page'

import * as gtag from '../lib/gtag'

export default class extends Component {
  state = { message: '' }

  handleInput = e => {
    this.setState({ message: e.target.value })
  }

  handleSubmit = e => {
    e.preventDefault()

    gtag.event({
      action: 'submit_form',
      category: 'Contact',
      label: this.state.message
    })

    this.setState({ message: '' })
  }

  render () {
    return (
      <Page>
        <h1>This is the Contact page</h1>
        <form onSubmit={this.handleSubmit}>
          <label>
            <span>Message:</span>
            <textarea onInput={this.handleInput} value={this.state.message} />
          </label>
          <button type='submit'>submit</button>
        </form>
      </Page>
    )
  }
}
