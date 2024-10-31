'use client'

import { startTransition } from 'react'
import { absoluteRedirect, relativeRedirect } from '../actions'

export default function Page() {
  return (
    <>
      <p>hello subdir page</p>
      <button
        onClick={async () => {
          startTransition(async () => {
            await relativeRedirect()
          })
        }}
        id="relative-subdir-redirect"
      >
        relative redirect
      </button>
      <button
        onClick={async () => {
          startTransition(async () => {
            await absoluteRedirect()
          })
        }}
        id="absolute-subdir-redirect"
      >
        absolute redirect
      </button>
    </>
  )
}
