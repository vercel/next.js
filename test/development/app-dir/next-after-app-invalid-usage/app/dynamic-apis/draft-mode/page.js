import { unstable_after as after, connection } from 'next/server'

export default function Page() {
  after(async () => {
    await connection()
  })
  return null
}
