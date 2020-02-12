import { useState } from 'react'
import Layout from '../components/layout'

const Login = () => {
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    event.preventDefault()

    if (errorMsg) setErrorMsg('')

    const username = e.currentTarget.username.value

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      if (response.status === 200) {
        // const { token } = await response.json()
        // await login({ token })
      } else {
        throw new Error(response.statusText)
      }
    } catch (error) {
      console.error('An unexpected error happened occurred:', error)
      setErrorMsg(error.message)
    }
  }

  return (
    <Layout>
      <div className="login">
        <form onSubmit={handleSubmit}>
          <label>
            <span>Username</span>
            <input type="text" name="username" />
          </label>
          <label>
            <span>Password</span>
            <input type="password" name="password" />
          </label>

          <button type="submit">Login</button>

          {errorMsg && <p className="error">Error: {errorMsg}</p>}
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
        form,
        label {
          display: flex;
          flex-flow: column;
        }
        label > span {
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
