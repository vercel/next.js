import { unstable_after as after, connection } from 'next/server'

export default function Page() {
  const promise = connection()
  after(async () => {
    await promise
  })
  return null
}
