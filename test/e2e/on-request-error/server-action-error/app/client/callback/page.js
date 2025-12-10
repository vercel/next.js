'use client'

import { serverLog } from '../actions'

export default function Page() {
  return (
    <div>
      <button onClick={() => serverLog('callback')}>Log to server</button>
    </div>
  )
}
