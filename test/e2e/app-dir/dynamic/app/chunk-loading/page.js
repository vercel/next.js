// This file is needed for the test, to ensure that the "comp.js" module is
// created as a dynamic import chunk.

'use client'

function noop() {}

export default function Page() {
  import('./comp').then((m) => {
    noop(m)
  })
  return null
}
