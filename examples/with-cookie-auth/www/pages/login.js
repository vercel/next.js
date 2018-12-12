import { Component } from 'react'
import Layout from '../components/layout'
import { login } from '../utils/auth'

class Login extends Component {
  static getInitialProps ({ req }) {
    const apiUrl = process.browser
      ? `https://${window.location.host}/api/login.js`
      : `https://${req.headers.host}/api/login.js`

    return { apiUrl }
  }

  constructor (props) {
    super(props)

    this.state = { username: '', error: '' }
    this.handleChange = this.handleChange.bind(this)
    this.handleSubmit = this.handleSubmit.bind(this)
  }

  handleChange (event) {
    this.setState({ username: event.target.value })
  }

  async handleSubmit (event) {
    event.preventDefault()
    const username = this.state.username
    const url = this.props.apiUrl
    login({ username, url }).catch(() =>
      this.setState({ error: 'Login failed.' })
    )
  }

  render () {
    return (
      <Layout>
        <div className='login'>
          <form onSubmit={this.handleSubmit}>
            <label htmlFor='username'>GitHub username</label>

            <input
              type='text'
              id='username'
              name='username'
              value={this.state.username}
              onChange={this.handleChange}
            />

            <button type='submit'>Login</button>

            <p className={`error ${this.state.error && 'show'}`}>
              {this.state.error && `Error: ${this.state.error}`}
            </p>
          </form>
        </div>
        <style jsx>{`
          .login {
            max-width: 340px;
            margin: 0 auto;
            padding: 1rem;
            border: 1px solid #ccc;
            border-radius: 4px;
          }

          form {
            display: flex;
            flex-flow: column;
          }

          label {
            font-weight: 600;
          }

          input {
            padding: 8px;
            margin: 0.3rem 0 1rem;
            border: 1px solid #ccc;
            border-radius: 4px;
          }

          .error {
            margin: 0.5rem 0 0;
            display: none;
            color: brown;
          }

          .error.show {
            display: block;
          }
        `}</style>
      </Layout>
    )
  }
}

export default Login
