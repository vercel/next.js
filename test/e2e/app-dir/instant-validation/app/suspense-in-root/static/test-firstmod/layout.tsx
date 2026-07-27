// No config. Hides {children}, so everything below (including the
// configured inter/inner page) never renders and is vacuous for
// validation. The route must validate cleanly.
import { ReactNode } from 'react'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <main>
      <p>test-firstmod root layout — children intentionally not rendered</p>
    </main>
  )
}
