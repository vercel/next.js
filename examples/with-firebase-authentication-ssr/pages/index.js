// TODO: js-cookie package
import useSWR from 'swr'
import Link from 'next/link'
import useAuthUser from '../utils/auth/useAuthUser'
import withAuthComponent from 'utils/auth/withAuthComponent'
import withAuthServerSideProps from 'utils/auth/withAuthServerSideProps'

const logout = async () => {
  console.log('TODO')
}

const fetcher = async (url, token) => {
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', token },
    credentials: 'same-origin',
  })
  return await res.json()
}

// TODO: don't hardcode domain
const endpoint = 'http://localhost:3000/api/getFood'

const Index = (props) => {
  const AuthUser = useAuthUser()
  const initialData = props.data
  const { data } = useSWR(endpoint, fetcher, { initialData })
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

export const getServerSideProps = withAuthServerSideProps(async () => {
  // TODO: get user token from context
  const data = await fetcher(endpoint)
  return { data: data }
})

export default withAuthComponent(Index)
