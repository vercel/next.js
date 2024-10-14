import { headers } from 'next/headers'
import { unstable_after as after } from 'next/server'

export default function Page() {
  const promise = headers()
  after(async () => {
    const headerStore = await promise
    console.log('after :: headerStore.get("host")', headerStore.get('host'))
  })
  return null
}
