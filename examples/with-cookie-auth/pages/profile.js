import React from 'react'
import Layout from '../components/Layout'
import { authInitialProps, getProfile } from '../lib/auth'

export default class Profile extends React.PureComponent {
  state = { user: 'Loading...' }

  componentDidMount () {
    // to test withCredentials
    getProfile().then(user => this.setState({ user }))
  }

  render () {
    return (
      <Layout {...this.props}>
        <h1>Profile</h1>
        <pre>{JSON.stringify(this.state.user, 0, 2)}</pre>
      </Layout>
    )
  }
}

Profile.getInitialProps = authInitialProps(false, true)
