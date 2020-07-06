import Layout from 'components/Layout'
import { NextPage } from 'next'
import Login from 'components/Account/Login'

const LoginPage: NextPage = () => {
  return (
    <Layout title="Login">
      <div className="container">
        <Login />
      </div>
    </Layout>
  )
}

export default LoginPage
