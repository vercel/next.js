'use client'

import ms from 'ms'
import { useEffect, useRef, useState } from 'react'

// https://github.com/streamich/react-use/blob/master/src/useInterval.ts
const useInterval = (callback: Function, delay?: number | null) => {
  const savedCallback = useRef<Function>(() => {})

  useEffect(() => {
    savedCallback.current = callback
  })

  useEffect(() => {
    if (delay !== null) {
      const interval = setInterval(() => savedCallback.current(), delay || 0)
      return () => clearInterval(interval)
    }

    return undefined
  }, [delay])
}

export function RenderedTimeAgo({ timestamp }: { timestamp: number }) {
  const [msAgo, setMsAgo] = useState<number>(0)

  // update on page change
  useEffect(() => {
    setMsAgo(Date.now() - timestamp)
  }, [timestamp])

  // update every second
  useInterval(() => {
    setMsAgo(Date.now() - timestamp)
  }, 1000)

  return (
    <div
      className="h-6 w-20 items-center rounded-full bg-gray-100 px-2 text-center text-sm leading-6"
      title={new Date(timestamp).toISOString()}
    >
      {msAgo ? (
        <>
          <span
            // https://beta.reactjs.org/apis/react-dom/hydrate#avoiding-unavoidable-hydration-mismatches
            suppressHydrationWarning={true}
            className="font-semibold tabular-nums text-gray-900"
          >
            {msAgo >= 1000 ? ms(msAgo) : '0s'}
          </span>{' '}
          <span className="text-gray-600">ago</span>
        </>
      ) : null}
    </div>
  )
}
