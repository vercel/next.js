import React, { useState } from 'react'
import {query as q} from 'faunadb'
import Layout from '../components/layout'
import { login, faunaClient } from '../utils/auth'

const signin = async (email, password) => {
  const loginRes = (await faunaClient().query(
    q.Login(q.Match(q.Index('users_by_email'), email), {
      password,
    })
  ))
  if (!loginRes.secret) {
    throw new Error('No secret present in login query response.');
  }
  return loginRes.secret;
};

function Login() {
  const [userData, setUserData] = useState({ email: '', password: '', error: '' })

  async function handleSubmit(event) {
    event.preventDefault()
    setUserData(Object.assign({}, userData, { error: '' }))

    const email = userData.email
    const password = userData.password

    try {
      const token = await signin(email, password)
      login({ token })
    } catch (error) {
      console.error(
        'You have an error in your code or there are Network issues.',
        error
      )

      const { response } = error
      setUserData(
        Object.assign({}, userData, {
          error: response ? response.statusText : error.message,
        })
      )
    }
  }

  return (
    <Layout>
      <div className="login">
        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>

          <input
            type="text"
            id="email"
            name="email"
            value={userData.email}
            onChange={event =>
              setUserData(
                Object.assign({}, userData, { email: event.target.value })
              )
            }
          />

          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            name="password"
            value={userData.password}
            onChange={event =>
              setUserData(
                Object.assign({}, userData, { password: event.target.value })
              )
            }
          />

          <button type="submit">Login</button>

          {userData.error && <p className="error">Error: {userData.error}</p>}
        </form>
      </div>
      <style jsx>{`
        .login {
          max-width: 340px;
          margin: 0 auto;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        form {
          display: flex;
          flex-flow: column;
        }

        label {
          font-weight: 600;
        }

        input {
          padding: 8px;
          margin: 0.3rem 0 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }

        .error {
          margin: 0.5rem 0 0;
          color: brown;
        }
      `}</style>
    </Layout>
  )
}

export default Login
