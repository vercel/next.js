import { Mutation, withApollo } from 'react-apollo'
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

const SigninBox = ({ client }) => {
  let email, password

  return (
    <Mutation
      mutation={SIGN_IN}
      onCompleted={data => {
        // Store the token in cookie
        document.cookie = cookie.serialize('token', data.signinUser.token, {
          maxAge: 30 * 24 * 60 * 60 // 30 days
        })
        // Force a reload of all the current queries now that the user is
        // logged in
        client.resetStore().then(() => {
          redirect({}, '/')
        })
      }}
      onError={error => {
        // If you want to send error to external service?
        console.log(error)
      }}>
      {(signinUser, { data, error, loading }) => (
        <div>
          <form
            onSubmit={e => {
              e.preventDefault()
              e.stopPropagation()

              signinUser({
                variables: {
                  email: email.value,
                  password: password.value
                }
              })

              email.value = password.value = ''
            }}>
            <input
              name='email'
              placeholder='Email'
              disabled={loading}
              ref={node => {
                email = node
              }}
            />
            <br />
            <input
              name='password'
              placeholder='Password'
              disabled={loading}
              ref={node => {
                password = node
              }}
              type='password'
            />
            <br />
            <button disabled={loading}>Sign in</button>
            {error && <p>No user found with that information.</p>}
            {loading && 'Loading…'}
            <style jsx>{`
              [disabled] {
                opacity: 0.3;
              }
            `}</style>
          </form>
        </div>
      )}
    </Mutation>
  )
}

export default withApollo(SigninBox)
