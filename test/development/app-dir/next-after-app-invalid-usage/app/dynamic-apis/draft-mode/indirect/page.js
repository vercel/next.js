import { draftMode } from 'next/headers'
import { unstable_after as after } from 'next/server'

export default function Page() {
  const promise = draftMode()
  after(async () => {
    await promise
  })
  return null
}
