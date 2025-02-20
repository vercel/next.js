import { after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  return <Wrapper />
}

function Wrapper() {
  return <Inner />
}

async function Inner() {
  await foo()
  return null
}

async function foo() {
  await setTimeout(0)
  after(() => {
    return bar()
  })
}

async function bar() {
  throws()
}

function throws() {
  throw new Error('kaboom')
}
