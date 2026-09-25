import type { Instant } from 'next'
import {
  default as Page,
  generateStaticParams,
} from '../../../_base/static-params-without-suspense/[slug]/page.base'

export const prefetch = 'partial'
export const unstable_ensureStatic = 'prefetch'

export const instant: Instant = {
  level: 'experimental-error',
  unstable_samples: [{ params: { slug: '123' } }],
}

export { generateStaticParams }
export default Page
