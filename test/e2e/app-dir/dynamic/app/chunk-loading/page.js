// This file is needed for the test, to ensure that the "comp.js" module is
// created as a dynamic import chunk.

'use client'

export default function Page() {
  import('./comp').then((m) => {
    console.log(m)
  })
  return null
}
