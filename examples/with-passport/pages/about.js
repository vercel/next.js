import React from 'react'
import Layout from '../components/layout'

const Home = () => (
  <Layout>
    <h1>Passport authentication example</h1>

    <p>
      This is the about page, navigations between this page and <i>Home</i> are
      always pretty fast, <i>Profile</i> takes more time because it uses SSR to
      fetch the user first
    </p>
  </Layout>
)

export default Home
