import { unstable_after } from 'next/server'

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
  unstable_after(bar())
}

async function bar() {
  unstable_after(function aboveZap() {
    return zap()
  })
}

async function zap() {
  throws()
}

function throws() {
  throw new Error('kaboom')
}
