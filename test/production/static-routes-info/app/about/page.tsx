// Second app-page so we can test the sharedAvg metric (which requires
// at least 2 routes of the same type). Imports the same shared module
// and the same client component as `app/page.tsx` so the tool's per-route
// file sets actually overlap beyond just framework/layout chunks.
import { sharedHelper } from '../../lib/shared'
import Counter from '../../components/Counter'

export default function About() {
  return (
    <p data-len={sharedHelper()}>
      about
      <Counter />
    </p>
  )
}
