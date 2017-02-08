import React from 'react'
import 'isomorphic-fetch'

export default class Login extends React.Component {

  constructor (props) {
    super(props)

    this.state = {
      submitted: false,
      email: ''
    }
  }

  onSubmit = e => {
    e.preventDefault()
    this.setState({
      submitted: true
    })

    window.fetch('/sendtoken', {
      method: 'POST',
      body: JSON.stringify({ user: this.state.email }),
      headers: new window.Headers({
        'Content-Type': 'application/json'
      })
    })
  }

  onEmailChange = e => {
    this.setState({
      email: e.target.value
    })
  }

  render () {
    if (this.state.submitted) {
      return (
        <div>
          <h3>We sent a magic link to your account :)</h3>
          <style jsx>{`
            div {
              text-align: center;
              margin-top: 200px;
            }
          `}</style>
        </div>
      )
    }

    return (
      <form onSubmit={this.onSubmit}>
        <h3>Login using your email :)</h3>
        <input onChange={this.onEmailChange} value={this.state.email}
          type='email' required placeholder='your@email.org' autoFocus />
        <input type='submit' value='Login' />
        <style jsx>{`
          form {
            text-align: center;
            margin-top: 200px;
          }
        `}</style>
      </form>
    )
  }
}
