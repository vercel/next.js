import React from 'react'
import Layout from '../components/layout'

const Home = () => (
  <Layout>
    <h1>Auth0 example</h1>
    <p>
      To test the login with click in <i>Login</i>
    </p>
    <p>
      Once you have logged in you should be able to click in <i>Profile</i> and{' '}
      <i>Logout</i>
    </p>
  </Layout>
)

export default Home
