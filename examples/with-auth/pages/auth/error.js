import Link from 'next/prefetch'

export default () => (
  <div>
    <h2>Unable to sign in</h2>
    <p>The link you tried to use to sign in was not valid.</p>
    <p><Link href='/auth/signin'><a>Request a new one to sign in.</a></Link></p>
  </div>
)
