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
          <div className="submit">
            {errorMsg && <p className="error">{errorMsg}</p>}
            <button type="submit">Login</button>
          </div>
        </form>
      </div>
      <style jsx>{`
        .login {
          max-width: 21rem;
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
        .submit {
          display: flex;
          justify-content: flex-end;
          align-items: center;
        }
        .submit > button {
          padding: 0.5rem 1rem;
          cursor: pointer;
          background: #fff;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
        .submit > button:hover {
          border-color: #888;
        }
        .error {
          color: brown;
          flex-grow: 1;
          margin: 0;
          margin-right: 1rem;
        }
      `}</style>
    </Layout>
  )
}

export default Login
