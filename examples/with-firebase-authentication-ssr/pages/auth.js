import FirebaseAuth from '../components/FirebaseAuth'
import withAuthComponent from 'utils/auth/withAuthComponent'

// TODO: redirect if user
const Auth = () => {
  return (
    <div>
      <p>Sign in</p>
      <div>
        <FirebaseAuth />
      </div>
    </div>
  )
}

export default withAuthComponent()(Auth)
