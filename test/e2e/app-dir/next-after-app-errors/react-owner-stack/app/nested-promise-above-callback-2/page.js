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
  after(bar())
}

async function bar() {
  // TODO(after): it looks like `aboveZap` is not in the stack if `zap` does `setTimeout(0)`?
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
