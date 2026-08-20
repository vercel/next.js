'use client'

import { useRef, useState } from 'react'
import { outer } from './actions'

type ReturnedAction = (value: string) => Promise<string>

export function ActionClient() {
  const actionRef = useRef<ReturnedAction | null>(null)
  const [status, setStatus] = useState('idle')

  return (
    <>
      <button
        id="get-inner"
        onClick={async () => {
          actionRef.current = await outer('captured')
          setStatus('stored')
        }}
      >
        Get inner
      </button>
      <button
        id="call-inner"
        onClick={async () => {
          if (actionRef.current) {
            setStatus(await actionRef.current('client'))
          }
        }}
      >
        Call inner
      </button>
      <p id="status">{status}</p>
    </>
  )
}
