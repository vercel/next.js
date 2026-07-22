'use client'

export function Row({ promise }) {
  promise.catch((error) => {
    console.error('[caught]', error.stack)
  })
  return <p>Row</p>
}
