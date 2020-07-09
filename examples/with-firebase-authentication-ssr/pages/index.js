// TODO: remove swr and js-cookie packages
import Link from 'next/link'
import useAuthUser from '../utils/auth/useAuthUser'
import withAuthComponent from 'utils/auth/withAuthComponent'
import withAuthServerSideProps from 'utils/auth/withAuthServerSideProps'

const logout = async () => {
  console.log('TODO')
}

const Index = () => {
  const AuthUser = useAuthUser()

  // TODO: use server-side props to display fetched data
  const data = {
    food: 'pizza',
  }

  if (!AuthUser.id) {
    return (
      <>
        <p>Hi there!</p>
        <p>
          You are not signed in.{' '}
          <Link href={'/auth'}>
            <a>Sign in</a>
          </Link>
        </p>
      </>
    )
  }

  return (
    <div>
      <div>
        <p>You're signed in. Email: {AuthUser.email}</p>
        <p
          style={{
            display: 'inline-block',
            color: 'blue',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
          onClick={() => logout()}
        >
          Log out
        </p>
      </div>
      <div>
        <Link href={'/example'}>
          <a>Another example page</a>
        </Link>
      </div>
      {data ? (
        <div>Your favorite food is {data.food}.</div>
      ) : (
        <div>Loading...</div>
      )}
    </div>
  )
}

export const getServerSideProps = withAuthServerSideProps()

export default withAuthComponent(Index)
