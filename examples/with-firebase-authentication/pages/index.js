import cookies from 'next-cookies'
import Link from 'next/link'
import Router from 'next/router'
import logout from '../utils/auth/logout'

const Index = (props) => {
  const { data } = props
  if (!data)
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
  return (
    <div>
      {data && (
        <>
          <div>
            <p>You're signed in. Email: {data.user.email}</p>
            <p
              style={{
                display: 'inlinelock',
                color: 'blue',
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
              onClick={async () => {
                try {
                  logout()
                  Router.push('/auth')
                } catch (e) {
                  console.error(e)
                }
              }}
            >
              Log out
            </p>
          </div>
          <div>
            <Link href={'/example'}>
              <a>Another example page</a>
            </Link>
          </div>
          <div>
            <div>Your favorite food is {data.food}.</div>
          </div>
        </>
      )}
    </div>
  )
}

export const getServerSideProps = async (context) => {
  const { auth } = cookies(context)
  if (!auth) {
    return {
      props: {
        data: null,
      },
    }
  }
  const { id, email, token } = auth

  try {
    const response = await fetch('http://localhost:3000/api/getFood', {
      method: 'GET',
      // eslint-disable-next-line no-undef
      headers: new Headers({ 'Content-Type': 'application/json', token }),
      credentials: 'same-origin',
    })

    const { food } = await response.json()

    const data = {
      user: {
        id,
        email,
      },
      food,
    }

    return { props: { data } }
  } catch (error) {
    console.log(error)
  }

  return {
    props: {
      data: '1',
    },
  }
}

export default Index
