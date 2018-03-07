import React from 'react'
import Router from 'next/router'
import { processLogin } from '../lib/auth'

class LoginForm extends React.PureComponent {
  state = {
    email: '',
    password: '',
    error: undefined
  }

  onChange = ({ target: { name, value } }) => {
    this.setState((state) => ({
      [name]: value
    }))
  }

  onSubmit = (e) => {
    e.preventDefault()
    const { email, password } = this.state
    this.setState({ error: undefined })
    processLogin({ email, password })
      .then(() => Router.push('/profile'))
      .catch(this.setError)
  }

  setError = (err) => {
    console.warn({err})
    const error = (err.response && err.response.data) || err.message
    this.setState({ error })
  }

  render () {
    const { email, password, error } = this.state
    return (
      <form onSubmit={this.onSubmit}>
        <div><input autoComplete='on' type='text' placeholder='email' name='email' value={email} onChange={this.onChange} /></div>
        <div><input autoComplete='on' type='password' name='password' value={password} onChange={this.onChange} /></div>
        <div>
          <button type='submit'>Submit</button>
        </div>
        {error && (
          <div>{error}</div>
        )}
      </form>
    )
  }
}

export default LoginForm
