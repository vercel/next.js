import React from 'react'
import Layout from '../components/Layout'

export const config = { amp: true }

const Home = () => (
  <Layout title="Offline" description="No internet connection.">
    <h1>Offline</h1>
    <p>Please try again later.</p>
  </Layout>
)

export default Home
