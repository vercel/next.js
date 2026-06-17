'use client'

import dynamic from 'next/dynamic'

const DynamicComponent = dynamic(() => import('./dynamic-component'), {
  loading: () => <div id="loading">Loading...</div>,
})

export default function CSPNoncePage() {
  return (
    <div>
      <h1 id="page-title">CSP Nonce Test Page</h1>
      <DynamicComponent />
    </div>
  )
}
