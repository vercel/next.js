'use client'

import { connection } from 'next/server'
import { serverLog } from '../actions'

export default async function Page() {
  await connection()
  return (
    <div>
      <button onClick={() => serverLog('callback')}>Log to server</button>
    </div>
  )
}
