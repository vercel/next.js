import Link from 'next/link'
import useAuthUser from 'utils/auth/useAuthUser'
import withAuthComponent from 'utils/auth/withAuthComponent'
import withAuthServerSideProps from 'utils/auth/withAuthServerSideProps'

const ExampleTwo = (props) => {
  const AuthUser = useAuthUser()
  return (
    <div>
      <p>
        This page is does not require user auth, so it won't redirect to the
        login page if you are not signed in.
      </p>
      <p>
        If you remove getServerSideProps from this page, the page will be static
        and load the authed user on the client side.
      </p>
      {AuthUser.id ? (
        <p>You're signed in. Email: {AuthUser.email}</p>
      ) : (
        <p>
          You are not signed in.{' '}
          <Link href={'/auth'}>
            <a>Sign in</a>
          </Link>
        </p>
      )}
      <Link href={'/'}>
        <a>Home</a>
      </Link>
    </div>
  )
}

export const getServerSideProps = withAuthServerSideProps()()

export default withAuthComponent({ authRequired: false })(ExampleTwo)
