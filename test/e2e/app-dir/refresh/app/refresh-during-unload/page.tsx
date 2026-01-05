import { connection } from 'next/server'
import Client from './client'

export default async function Page() {
  await connection()

  return (
    <div>
      <div id="page-content">Page loaded successfully</div>
      <Client />
    </div>
  )
}
