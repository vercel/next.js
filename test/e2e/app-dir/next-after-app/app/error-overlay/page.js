import { after } from 'next/server'
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
  after(async () => {
    // TODO(after): this delay is load-bearing, otherwise
    // the client-side won't have booted yet and our `HMR_ACTIONS_SENT_TO_BROWSER.AFTER_ERROR`
    // will be dropped on the floor, so we won't display anything
    await setTimeout(1000)
    throws()
  })
}

function throws() {
  // throw new Error('kaboom')
}
