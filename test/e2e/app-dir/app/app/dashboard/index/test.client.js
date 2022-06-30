import { useState, lazy } from 'react'

const Lazy = lazy(() => import('./lazy.client.js'))

export function ClientComponent() {
  let [state] = useState('client')
  return (
    <>
      <Lazy />
      <p className="hi">hello from modern the {state}</p>
    </>
  )
}
