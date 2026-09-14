'use client'
import dynamic from 'next/dynamic'

// Imported by the App Router only. Its manifest entry must survive, because the
// App Router's dynamic() reads `files` from it at SSR time to inject this CSS.
const AppOnlyLazy = dynamic(() => import('./AppOnlyLazy'))

export default function ClientEntry() {
  return <AppOnlyLazy />
}
