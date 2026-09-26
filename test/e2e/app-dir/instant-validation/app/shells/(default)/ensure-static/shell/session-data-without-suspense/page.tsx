import type { Instant } from 'next'
import { default as Page } from '../../_base/session-data-without-suspense/page.base'

export const prefetch = 'partial'
export const unstable_ensureStatic = 'shell'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ cookies: [] }],
}

export default Page
