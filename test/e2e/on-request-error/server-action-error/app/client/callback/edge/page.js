'use client'

import { connection } from 'next/server'
import { serverLog } from '../../actions'

export default async function Page() {
  await connection()
  return (
    <div>
      <button onClick={() => serverLog('callback:edge')}>Log to server</button>
    </div>
  )
}

export const runtime = 'edge'
