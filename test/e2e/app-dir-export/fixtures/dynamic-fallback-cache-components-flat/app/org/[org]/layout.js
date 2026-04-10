import { Suspense } from 'react'
import OrgClient from './org-client'

export default function OrgLayout({ children }) {
  return (
    <main>
      <Suspense fallback={<p id="org-name">Loading org...</p>}>
        <OrgClient />
      </Suspense>
      {children}
    </main>
  )
}
