'use client'

import { serverLog } from '../../actions'

export default function Page() {
  return (
    <div>
      <button onClick={() => serverLog('callback:edge')}>Log to server</button>
    </div>
  )
}

export const runtime = 'edge'
