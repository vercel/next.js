import { connection, unstable_after as after } from 'next/server'

export default function Page() {
  after(async () => {
    await connection()
  })
  return null
}
