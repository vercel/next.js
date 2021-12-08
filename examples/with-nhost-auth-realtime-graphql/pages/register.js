import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

import { nhost } from '../utils/nhost'

export default function Login() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleLogin(e) {
    e.preventDefault()

    try {
      await nhost.auth.register({
        email,
        password,
        options: {
          userData: {
            display_name: displayName,
          },
        },
      })
    } catch (error) {
      console.error(error)
      return alert('failed to register')
    }

    router.push('/')
  }

  return (
    <div>
      <form onSubmit={handleLogin}>
        <div>
          <input
            placeholder="Name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
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
          <button type="submit">Register</button>
        </div>
      </form>

      <div>
        <Link href="/login">Login</Link>
      </div>
    </div>
  )
}
