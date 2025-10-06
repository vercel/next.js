'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'

export function StatefulClientComponent({ n }: { n: string }) {
  const [count, setCount] = useState(0)
  const searchParams = useSearchParams()
  return (
    <div>
      <div>
        <button
          id={'increment-button-' + n}
          onClick={() => setCount(count + 1)}
        >
          Increment
        </button>
        <span id={'counter-display-' + n}>Count: {count}</span>
      </div>
      <div>
        <input id={'uncontrolled-input-' + n} type="text" />
      </div>
      <div id={'has-search-param-' + n}>
        Has search param: {searchParams.get('param') ? 'yes' : 'no'}
      </div>
    </div>
  )
}
