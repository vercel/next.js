import { lang } from 'next/root-params'
import { connection } from 'next/server'
import { setTimeout } from 'node:timers/promises'

async function inner() {
  'use cache'
  const language = await lang()
  return {
    early: language,
    // This promise keeps the inner Flight stream open after its root model
    // resolves. The outer functions return only `early`, so they do not wait
    // for this promise.
    tail: setTimeout(3000),
  }
}

async function outerOne() {
  'use cache'
  return (await inner()).early
}

async function outerTwo() {
  'use cache'
  return (await inner()).early
}

export default async function Page() {
  await connection()
  const first = await outerOne()
  const second = await outerTwo()
  // The page waits for `tail` outside the outer cache before the next request
  // tests reuse.
  const { tail } = await inner()
  await tail
  return (
    <>
      <p id="first">{first}</p>
      <p id="second">{second}</p>
    </>
  )
}
