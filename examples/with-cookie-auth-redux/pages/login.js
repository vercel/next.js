import React, { Component } from 'react'
import withRedux from 'next-redux-wrapper'
import { initStore, login } from '../store'

class Login extends Component {
  state = {
    username: '',
    password: ''
  }

  handleOnChange = (e) => {
    this.setState({
      [e.target.name]: e.target.value
    })
  }

  handleLoginSubmit = (e) => {
    e.preventDefault()
    const { dispatch } = this.props
    const payload = {
      username: this.state.username,
      password: this.state.password
    }
    dispatch(login(payload))
      .catch(err => {
        alert(err.response.data.message)
      })
  }

  render () {
    return (
      <div>
        <form onSubmit={this.handleLoginSubmit}>
          <div>
            <label>Username</label>
            <input type="text" name="username" onChange={this.handleOnChange}/>
          </div>
          <div>
            <label>Password</label>
            <input type="password" name="password" onChange={this.handleOnChange}/>
          </div>
          <div>
            <button>Login</button>
          </div>
          <small>Username: "user@example.com", password: "changeme"</small>
          <br/>
          <small>Staff username: "staff@example.com", password: "changeme"</small>
        </form>
      </div>
    )
  }
}

export default withRedux(initStore)(Login)
