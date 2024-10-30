import { headers } from 'next/headers'
import { unstable_after as after } from 'next/server'

export default function Page() {
  after(async () => {
    await headers()
  })
  return null
}
