'use client'

import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { delayedAction } from './actions'

export default function Page() {
  const router = useRouter()
  const [result, setResult] = useState<string | null>(null)
  const [_, startTransition] = useTransition()

  async function onClick() {
    startTransition(async () => {
      const value = await delayedAction()

      // This is the state update that must NOT be committed
      // if navigation has already occurred
      setResult(value)
    })

    // Navigate immediately after starting the action
    router.push('/next')
  }

  return (
    <main>
      <button onClick={onClick}>Run server action</button>

      {result && <div id="result">{result}</div>}
    </main>
  )
}
