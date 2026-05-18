// No config. Hides {children} to trigger the missing-boundary fallback.
// The config lives deeper (inner/leaf/page.tsx), but this layout is
// what prevents it from rendering.
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main>
      <p>test-firstmod root layout — children intentionally not rendered</p>
    </main>
  )
}
