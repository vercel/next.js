import { useState, useEffect } from 'react'
import Router from 'next/router'
import { useUser } from '../lib/hooks'

export default function LoginPage() {
  const [user, { mutate }] = useUser()
  const [errorMsg, setErrorMsg] = useState('')
  async function onSubmit(e) {
    e.preventDefault()
    const body = {
      username: e.currentTarget.username.value,
      password: e.currentTarget.password.value,
    }
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 200) {
      const userObj = await res.json()
      mutate(userObj)
    } else {
      setErrorMsg('Incorrect username or password. Try better!')
    }
  }
  useEffect(() => {
    // redirect to home if user is authenticated
    if (user) Router.push('/')
  }, [user])

  return (
    <>
      <style jsx>{`
        .danger {
          text-align: center;
          color: red;
        }
        .light {
          color: #777;
        }
        h1 {
          text-align: center;
          font-size: 3rem;
          font-weight: 700;
        }
        code {
          background-color: #0070f3;
          padding: 0.2rem;
          color: #fff;
        }
      `}</style>
      <h1>Login to Example</h1>
      {errorMsg ? <p className="danger">{errorMsg}</p> : null}
      <form onSubmit={onSubmit}>
        <label>
          <span>Username</span>
          <input type="text" name="username" required />
        </label>
        <label>
          <span>Password</span>
          <input type="password" name="password" required />
        </label>
        <p className="light">
          Enter any username, and password is <code>hackme</code>
        </p>
        <button type="submit">Login</button>
      </form>
    </>
  )
}
