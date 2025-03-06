'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { myAction } from './server'

export default function Page() {
  const router = useRouter()
  const [text, setText] = useState('initial')

  return (
    <>
      <button
        type="button"
        onClick={() => {
          Promise.all([myAction(0), myAction(1)]).then(() => setText('done'))
          setTimeout(() => {
            router.replace('?')
          })
        }}
      >
        run actions
      </button>
      <div id="action-state">{text}</div>
    </>
  )
}
