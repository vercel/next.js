import { after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  helper()
  return null
}

function helper() {
  after(async () => {
    await setTimeout(500)
    nestedHelper()
  })
}

function nestedHelper() {
  after(async () => {
    await setTimeout(500)
    throws()
  })
}

function throws() {
  throw new Error('kaboom')
}
