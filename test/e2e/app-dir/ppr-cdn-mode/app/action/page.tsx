import { Suspense } from 'react'
import { connection } from 'next/server'
import { updateTag } from 'next/cache'
import { bumpVersion, getValue } from './value'

// A cached value in the shell, and a server action rendered inside the hole.
// The action updates the cached value.
export default async function Page() {
  return (
    <main>
      <h1 id="heading">Server action</h1>
      <p id="static-value">{await getValue()}</p>
      <Suspense fallback={<p id="fallback">Loading…</p>}>
        <Form />
      </Suspense>
    </main>
  )
}

async function Form() {
  await connection()
  async function bump() {
    'use server'
    bumpVersion()
    updateTag('ppr-cdn-mode:value')
  }
  return (
    <form action={bump}>
      <p id="dynamic">Now: {Date.now()}</p>
      <button id="bump" type="submit">
        Bump
      </button>
    </form>
  )
}
