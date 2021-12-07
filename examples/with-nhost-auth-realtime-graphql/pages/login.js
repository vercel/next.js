import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

import { nhost } from '../utils/nhost'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleLogin(e) {
    e.preventDefault()

    try {
      await nhost.auth.login({ email, password })
    } catch (error) {
      console.error(error)
      return alert('failed to login')
    }

    router.push('/')
  }

  return (
    <div>
      <form onSubmit={handleLogin}>
        <div>
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <button type="submit">Login</button>
        </div>
      </form>

      <div>
        <Link href="/register">Register</Link>
      </div>
    </div>
  )
}
