import Layout from '../components/layout'

const Home = () => (
  <Layout>
    <h1>Profile</h1>
    <p>Your session: {JSON.stringify({ yo: 'yay' })}</p>
  </Layout>
)

export default Home
