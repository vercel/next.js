'use client'

import { startTransition } from 'react'
import {
  absoluteRedirect,
  multiRelativeRedirect,
  relativeRedirect,
} from '../actions'

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
            await multiRelativeRedirect()
          })
        }}
        id="multi-relative-subdir-redirect"
      >
        multi-level relative redirect
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
