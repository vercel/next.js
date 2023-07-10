'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Link from 'next/link'

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
    router.refresh()
  }

  return (
    <div className="flex-1 flex flex-col w-full px-8 sm:max-w-md justify-center gap-2">
      <Link
        href="/"
        className="absolute left-8 top-8 py-2 px-4 rounded-md no-underline text-foreground bg-btn-background hover:bg-btn-background-hover flex items-center group text-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>{' '}
        Back
      </Link>
      {view === 'check-email' ? (
        <p className="text-center text-foreground">
          Check <span className="font-bold">{email}</span> to continue signing
          up
        </p>
      ) : (
        <form
          className="flex-1 flex flex-col w-full justify-center gap-2 text-foreground"
          onSubmit={view === 'sign-in' ? handleSignIn : handleSignUp}
        >
          <label className="text-md" htmlFor="email">
            Email
          </label>
          <input
            className="rounded-md px-4 py-2 bg-inherit border mb-6"
            name="email"
            onChange={(e) => setEmail(e.target.value)}
            value={email}
            placeholder="you@example.com"
          />
          <label className="text-md" htmlFor="password">
            Password
          </label>
          <input
            className="rounded-md px-4 py-2 bg-inherit border mb-6"
            type="password"
            name="password"
            onChange={(e) => setPassword(e.target.value)}
            value={password}
            placeholder="••••••••"
          />
          {view === 'sign-in' && (
            <>
              <button className="bg-green-700 rounded px-4 py-2 text-white mb-6">
                Sign In
              </button>
              <p className="text-sm text-center">
                Don't have an account?
                <button
                  className="ml-1 underline"
                  onClick={() => setView('sign-up')}
                >
                  Sign Up Now
                </button>
              </p>
            </>
          )}
          {view === 'sign-up' && (
            <>
              <button className="bg-green-700 rounded px-4 py-2 text-white mb-6">
                Sign Up
              </button>
              <p className="text-sm text-center">
                Already have an account?
                <button
                  className="ml-1 underline"
                  onClick={() => setView('sign-in')}
                >
                  Sign In Now
                </button>
              </p>
            </>
          )}
        </form>
      )}
    </div>
  )
}
