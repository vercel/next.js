import { cookies } from 'next/headers'
import { unstable_after as after } from 'next/server'

export default function Page() {
  const promise = cookies()
  after(async () => {
    await promise
  })
  return null
}
