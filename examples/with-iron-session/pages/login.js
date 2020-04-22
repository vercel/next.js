import React from 'react'
import { useState } from 'react'
import useUser from '../lib/hooks/useUser'
import Layout from '../components/layout'
import Form from '../components/form'
import fetch from '../lib/fetch'
import { mutate } from 'swr'

const Login = () => {
  useUser({ redirectTo: '/profile-sg', redirectIfFound: true })

  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()

    const body = {
      username: e.currentTarget.username.value,
    }

    try {
      const user = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      mutate('/api/user', user)
    } catch (error) {
      console.error('An unexpected error happened:', error)
      setErrorMsg(error.data.message)
    }
  }

  return (
    <Layout>
      <div className="login">
        <Form isLogin errorMessage={errorMsg} onSubmit={handleSubmit} />
      </div>
      <style jsx>{`
        .login {
          max-width: 21rem;
          margin: 0 auto;
          padding: 1rem;
          border: 1px solid #ccc;
          border-radius: 4px;
        }
      `}</style>
    </Layout>
  )
}

export default Login
