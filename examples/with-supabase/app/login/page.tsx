'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [view, setView] = useState('sign-in')
  const router = useRouter()
  const supabase = createClientComponentClient()

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    setView('check-email')
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    await supabase.auth.signInWithPassword({
      email,
      password,
    })
    router.push('/')
  }

  return (
    <div className="flex-1 flex flex-col w-full max-w-sm justify-center gap-2">
      {view === 'check-email' ? (
        <p className="text-center text-neutral-400">
          Check <span className="font-bold text-white">{email}</span> to
          continue signing up
        </p>
      ) : (
        <form
          className="flex-1 flex flex-col w-full max-w-sm justify-center gap-2"
          onSubmit={view === 'sign-in' ? handleSignIn : handleSignUp}
        >
          <label className="text-md text-neutral-400" htmlFor="email">
            Email
          </label>
          <input
            className="rounded-md px-4 py-2 bg-inherit border mb-6 text-neutral-100"
            name="email"
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            placeholder="you@example.com"
          />
          <label className="text-md text-neutral-400" htmlFor="password">
            Password
          </label>
          <input
            className="rounded-md px-4 py-2 bg-inherit border mb-6 text-neutral-100"
            type="password"
            name="password"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            placeholder="••••••••"
          />
          {view === 'sign-in' ? (
            <>
              <button className="bg-green-700 rounded px-4 py-2 text-neutral-200 mb-6">
                Sign In
              </button>
              <p className="text-sm text-neutral-500 text-center">
                Don't have an account?
                <button
                  className="ml-1 text-white underline"
                  onClick={() => setView('sign-up')}
                >
                  Sign Up Now
                </button>
              </p>
            </>
          ) : null}
          {view === 'sign-up' ? (
            <>
              <button className="bg-green-700 rounded px-4 py-2 text-neutral-200 mb-6">
                Sign Up
              </button>
              <p className="text-sm text-neutral-500 text-center">
                Already have an account?
                <button
                  className="ml-1 text-white underline"
                  onClick={() => setView('sign-in')}
                >
                  Sign In Now
                </button>
              </p>
            </>
          ) : null}
        </form>
      )}
    </div>
  )
}
