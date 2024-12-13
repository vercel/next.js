import { after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  return <Wrapper />
}

function Wrapper() {
  return <Inner />
}

function Inner() {
  foo()
  return null
}

function foo() {
  after(bar())
}

async function bar() {
  // `aboveZap` is not in the stack if `zap` does `setTimeout(0)`
  after(function aboveZap() {
    return zap()
  })
}

async function zap() {
  await setTimeout(0)
  throws()
}

function throws() {
  throw new Error('kaboom')
}
