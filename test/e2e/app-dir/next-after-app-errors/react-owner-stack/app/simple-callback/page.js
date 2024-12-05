import { unstable_after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  return <Wrapper />
}

function Wrapper() {
  return <Inner />
}

function Inner() {
  helper()
  return null
}

function helper() {
  unstable_after(async () => {
    await setTimeout(0)
    throws()
  })
}

function throws() {
  throw new Error('kaboom')
}
