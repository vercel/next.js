'use client'
import { useTransition, useState } from 'react'
import { badAction, getServerData } from './actions'

export default function Component() {
  const [isPending, startTransition] = useTransition()
  const [wasSubmitted, setWasSubmitted] = useState(false)
  return (
    <>
      {wasSubmitted && <div id="submitted-msg">Submitted!</div>}
      <button
        id="good-action"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            getServerData()
              .catch(() => {
                console.log('error caught in user code')
              })
              .finally(() => {
                setWasSubmitted(true)
              })
          })
        }}
      >
        Submit Action
      </button>

      <button
        id="bad-action"
        disabled={isPending}
        onClick={() => {
          startTransition(() => {
            badAction()
              .catch(() => {
                console.log('error caught in user code')
              })
              .finally(() => {
                setWasSubmitted(true)
              })
          })
        }}
      >
        Submit Action (Throws)
      </button>
    </>
  )
}
