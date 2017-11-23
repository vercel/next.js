import Link from 'next/prefetch'
import withSession from './with-session'

const Unauthorized = () => (
  <div>
    <h1>Unauthorized</h1>
    <p>You are not authorized to view this page.</p>
    <p><Link href='/auth/signin'><a>Please log in</a></Link></p>
    <p><Link href='/'><a>Back to homepage</a></Link></p>
  </div>
)

export default (Component) => {
  const checkAuth = (props) => {
    return props.isLoggedIn ? <Component {...props} /> : <Unauthorized />
  }

  return withSession(checkAuth)
}
