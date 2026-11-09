import { lang } from 'next/root-params'
import { connection } from 'next/server'
import { setTimeout } from 'node:timers/promises'

async function inner() {
  'use cache'
  const language = await lang()
  return {
    early: language,
    // This promise keeps the inner Flight stream open after its root model
    // resolves. The outer function returns only `early`, so it does not wait
    // for this promise.
    tail: setTimeout(3000),
  }
}

async function outer() {
  'use cache'
  return (await inner()).early
}

export default async function Page() {
  await connection()
  const value = await outer()
  // The page waits for `tail` outside the outer cache before the next request
  // tests reuse.
  const { tail } = await inner()
  await tail
  return <p id="value">{value}</p>
}
