import { unstable_after } from 'next/server'
import { setTimeout } from 'timers/promises'

export default function Page() {
  unstable_after(async () => {
    await setTimeout(500)
    throw new Error('kaboom')
  })
  return null
}
