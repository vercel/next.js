import React from 'react'
import Layout from '../components/Layout'
import { authInitialProps } from '../lib/auth'
import LoginForm from '../components/LoginForm'

export default class Login extends React.PureComponent {
  render () {
    return (
      <Layout {...this.props}>
        <h1>Login</h1>
        <LoginForm />
      </Layout>
    )
  }
}

Login.getInitialProps = authInitialProps(true)
