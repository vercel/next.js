// Second app-page so we can test the sharedAvg metric (which requires
// at least 2 routes of the same type). Imports the same shared module
// as `app/page.tsx` so the tool's per-route file sets actually overlap
// beyond just framework/layout chunks.
import { sharedHelper } from '../../lib/shared'

export default function About() {
  return <p data-len={sharedHelper()}>about</p>
}
