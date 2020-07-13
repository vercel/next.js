import FirebaseAuth from '../components/FirebaseAuth'
import useFirebaseCookieManager from 'utils/auth/useFirebaseCookieManager'

const Auth = () => {
  useFirebaseCookieManager()
  return (
    <div>
      <p>Sign in</p>
      <div>
        <FirebaseAuth />
      </div>
    </div>
  )
}

export default Auth
