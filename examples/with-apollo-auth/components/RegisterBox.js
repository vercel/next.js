import { useRef } from 'react'
import { useMutation, useApolloClient } from '@apollo/react-hooks'
import gql from 'graphql-tag'
import cookie from 'cookie'
import redirect from '../lib/redirect'

const CREATE_USER = gql`
  mutation Create($name: String!, $email: String!, $password: String!) {
    createUser(
      name: $name
      authProvider: { email: { email: $email, password: $password } }
    ) {
      id
    }
    signinUser(email: { email: $email, password: $password }) {
      token
    }
  }
`

const RegisterBox = () => {
  const client = useApolloClient()

  const onCompleted = data => {
    // Store the token in cookie
    document.cookie = cookie.serialize('token', data.signinUser.token, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/' // make cookie available for all routes underneath "/"
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
  const [create, { error }] = useMutation(CREATE_USER, { onCompleted, onError })

  const name = useRef(null)
  const email = useRef(null)
  const password = useRef(null)

  return (
    <form
      onSubmit={e => {
        e.preventDefault()
        e.stopPropagation()

        create({
          variables: {
            name: name.current.value,
            email: email.current.value,
            password: password.current.value
          }
        })

        name.current.value = email.current.value = password.current.value = ''
      }}
    >
      {error && <p>Issue occurred while registering :(</p>}
      <input name='name' placeholder='Name' ref={name} />
      <br />
      <input name='email' placeholder='Email' ref={email} />
      <br />
      <input
        name='password'
        placeholder='Password'
        ref={password}
        type='password'
      />
      <br />
      <button>Register</button>
    </form>
  )
}

export default RegisterBox
