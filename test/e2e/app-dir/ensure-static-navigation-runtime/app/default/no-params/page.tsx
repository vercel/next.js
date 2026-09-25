import { Timestamp } from '../../../components/timestamp'

export const unstable_ensureStatic = 'navigation'

export default function Page() {
  return (
    <main>
      <Timestamp />
      <p>This page does not use any params, and should be fully static.</p>
      <p id="static-content">Static content</p>
    </main>
  )
}
