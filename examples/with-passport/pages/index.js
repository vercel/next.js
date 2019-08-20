import React from 'react'
import Layout from '../components/layout'

const Home = () => (
  <Layout>
    <h1>Passport authentication example</h1>

    <p>
      To test the login with GitHub click in <i>Login</i>
    </p>
    <p>
      Once you have logged in you should be able to click in <i>Profile</i> and{' '}
      <i>Logout</i>
    </p>
  </Layout>
)

export default Home
