import { connection } from 'next/server'
import { refresh } from 'next/cache'

export default async function Page() {
  await connection()
  refresh()

  return <div>This should error</div>
}
