import React, { Component } from 'react'

export default class extends Component {
  state = { message: '' }

  render () {
    return (
      <div>
        <h1>This is the Contact page</h1>
        <form onSubmit={this.handleSubmit}>
          <label>
            <span>Message:</span>
            <textarea onChange={this.handleInput} value={this.state.message} />
          </label>
          <button type='submit'>submit</button>
        </form>

        <style jsx>{`
          label span {
            display: block;
            margin-bottom: 12px;
          }

          textarea {
            min-width: 300px;
            min-height: 120px;
          }

          button {
            margin-top: 12px;
            display: block;
          }
        `}</style>
      </div>
    )
  }

  handleInput = e => {
    this.setState({ message: e.target.value })
  }

  handleSubmit = e => {
    e.preventDefault()
    global.analytics.track('Form Submitted', {
      message: this.state.message
    })
    this.setState({ message: '' })
  }
}
