'use client'

import { startTransition } from 'react'
import { absoluteRedirect, relativeRedirect } from './actions'

export default function Page() {
  return (
    <>
      <p>hello root page</p>
      <button
        onClick={async () => {
          startTransition(async () => {
            await relativeRedirect()
          })
        }}
        id="relative-redirect"
      >
        relative redirect
      </button>
      <button
        onClick={async () => {
          startTransition(async () => {
            await absoluteRedirect()
          })
        }}
        id="absolute-redirect"
      >
        absolute redirect
      </button>
    </>
  )
}
