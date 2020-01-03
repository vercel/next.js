import React from 'react'
import Link from 'next/link'
import { withApollo } from '../apollo/client'
import gql from 'graphql-tag'
import { useMutation } from '@apollo/react-hooks'
import Field from '../components/field'
import { getStatusFrom } from '../lib/form'
import { useRouter } from 'next/router'

const SignUpMutation = gql`
  mutation SignUpMutation($email: String!, $password: String!) {
    signUp(input: { email: $email, password: $password }) {
      user {
        id
        email
      }
    }
  }
`

function SignUp() {
  const [signUp] = useMutation(SignUpMutation)
  const [status, setStatus] = React.useState({})
  const router = useRouter()
  async function handleSubmit(event) {
    event.preventDefault()
    const emailElement = event.currentTarget.elements.email
    const passwordElement = event.currentTarget.elements.password

    try {
      await signUp({
        variables: {
          email: emailElement.value,
          password: passwordElement.value,
        },
      })

      router.push('/signin')
    } catch (error) {
      setStatus(getStatusFrom(error))
    }
  }

  return (
    <>
      <h1>Sign Up</h1>
      <form onSubmit={handleSubmit}>
        <Field
          name="email"
          type="email"
          autoComplete="email"
          required
          label="Email"
          status={status.email}
        />
        <Field
          name="password"
          type="password"
          autoComplete="password"
          required
          label="Password"
          status={status.password}
        />
        <button type="submit">Sign up</button> or{' '}
        <Link href="signin">
          <a>Sign in</a>
        </Link>
      </form>
    </>
  )
}

export default withApollo(SignUp)
