'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { slowServerAction } from './actions'

export default function Page() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleClick = () => {
    startTransition(async () => {
      router.push('/other')
      await slowServerAction()
    })
  }

  return (
    <div>
      <p id="status">{isPending ? 'pending' : 'idle'}</p>
      <button id="trigger-btn" onClick={handleClick}>
        {isPending ? 'Loading...' : 'Navigate with Action'}
      </button>
    </div>
  )
}
