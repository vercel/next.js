import { after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  return <Wrapper />
}

function Wrapper() {
  return <Inner />
}

function Inner() {
  bar()
  return null
}

function bar() {
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
