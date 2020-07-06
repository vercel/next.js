import Layout from 'components/Layout'
import FadeIn from 'react-fade-in'
import { NextPage } from 'next'

import Signup from 'components/Account/Signup'

const SignupPage: NextPage = () => {
  return (
    <Layout title="Login">
      <FadeIn>
        <div className="container">
          <div className="row">
            <div className="col-lg-6 col-12">
              <Signup />
            </div>
          </div>
        </div>
      </FadeIn>
    </Layout>
  )
}

export default SignupPage
