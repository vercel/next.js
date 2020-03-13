import Layout from '../components/layout'
import AuthProvider from './../lib/authProvider'

function Home() {
  return (
    <AuthProvider>
      <Layout>
        <h1>Next.js and Auth0 Example</h1>
        <p>
          To test the login click in <i>Login</i>
        </p>
        <p>
          Once you have logged in you should be able to click in <i>Profile</i>{' '}
          and <i>Logout</i>
        </p>
      </Layout>
    </AuthProvider>
  )
}

export default Home
