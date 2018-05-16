import { Mutation, withApollo } from 'react-apollo'
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

const RegisterBox = props => {
  let name, email, password

  return (
    <Mutation
      mutation={CREATE_USER}
      onCompleted={data => {
        // Store the token in cookie
        document.cookie = cookie.serialize('token', data.signinUser.token, {
          maxAge: 30 * 24 * 60 * 60 // 30 days
        })
        // Force a reload of all the current queries now that the user is
        // logged in
        props.client.resetStore().then(() => {
          redirect({}, '/')
        })
      }}
      onError={error => {
        // If you want to send error to external service?
        console.log(error)
      }}>
      {(create, { data, error, loading }) => (
        <div>
          <form
            onSubmit={e => {
              e.preventDefault()
              e.stopPropagation()

              create({
                variables: {
                  name: name.value,
                  email: email.value,
                  password: password.value
                }
              })
            }}>
            <input
              name='name'
              placeholder='Name'
              disabled={loading}
              ref={node => {
                name = node
              }}
            />
            <br />
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
            <button disabled={loading}>Register</button>
            {error && <p>Issue occured while registering :(</p>}
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

export default withApollo(RegisterBox)
