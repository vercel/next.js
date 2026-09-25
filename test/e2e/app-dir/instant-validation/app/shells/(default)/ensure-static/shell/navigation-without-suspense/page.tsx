import type { Instant } from 'next'
import { default as Page } from '../../_base/navigation-without-suspense/page.base'

export const prefetch = 'partial'
export const unstable_ensureStatic = 'shell'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{}],
}

export default Page
