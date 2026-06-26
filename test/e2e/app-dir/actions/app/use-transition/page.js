'use client'

import { useTransition } from 'react'
import { addToCart } from './action'

export default function Page() {
  const [isPending, startTransition] = useTransition()

  return (
    <div className="grid ">
      <h1>Transition is: {isPending ? 'pending' : 'idle'} </h1>
      <button
        id="action-button"
        onClick={() => {
          startTransition(async () => {
            await addToCart()
          })
        }}
      >
        Trigger action
      </button>
    </div>
  )
}
