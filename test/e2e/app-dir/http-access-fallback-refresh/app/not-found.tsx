import { AccessToggle } from './components/access-toggle'
import { FallbackState } from './components/fallback-state'

export default function NotFound() {
  return (
    <main id="access-not-found">
      <p>Access not found</p>
      <FallbackState />
      <AccessToggle access="grant" />
    </main>
  )
}
