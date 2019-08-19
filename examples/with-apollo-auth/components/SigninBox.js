import { useRef } from 'react'
import { useMutation, useApolloClient } from '@apollo/react-hooks'
import gql from 'graphql-tag'
import cookie from 'cookie'
import redirect from '../lib/redirect'

const SIGN_IN = gql`
  mutation Signin($email: String!, $password: String!) {
    signinUser(email: { email: $email, password: $password }) {
      token
    }
  }
`

// TODO: Find a better name for component.
const SigninBox = () => {
  const client = useApolloClient()

  const onCompleted = data => {
    // Store the token in cookie
    document.cookie = cookie.serialize('token', data.signinUser.token, {
      maxAge: 30 * 24 * 60 * 60 // 30 days
    })
    // Force a reload of all the current queries now that the user is
    // logged in
    client.cache.reset().then(() => {
      redirect({}, '/')
    })
  }

  const onError = error => {
    // If you want to send error to external service?
    console.error(error)
  }

  const [signinUser, { error }] = useMutation(SIGN_IN, {
    onCompleted,
    onError
  })

  const email = useRef(null)
  const password = useRef(null)

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()

        signinUser({
          variables: {
            email: email.current.value,
            password: password.current.value
          }
        })

        email.current.value = password.current.value = ''
      }}
    >
      {error && <p>No user found with that information.</p>}
      <input name='email' placeholder='Email' ref={email} />
      <br />
      <input
        name='password'
        placeholder='Password'
        ref={password}
        type='password'
      />
      <br />
      <button>Sign in</button>
    </form>
  )
}

export default SigninBox
