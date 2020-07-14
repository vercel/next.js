import FirebaseAuth from '../components/FirebaseAuth'
import withAuthComponent from 'utils/auth/withAuthComponent'

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

export default withAuthComponent({ redirectIfAuthed: true })(Auth)
