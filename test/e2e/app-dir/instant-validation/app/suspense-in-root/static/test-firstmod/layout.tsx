// No config. Hides its plain {children}, so everything below (including
// the configured inter/inner page) never renders. This is not a fork —
// there is no sibling slot to render instead — so the configured page is
// still considered for validation and the route reports "could not
// validate" pointing at the shallowest unrendered file.
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main>
      <p>test-firstmod root layout — children intentionally not rendered</p>
    </main>
  )
}
