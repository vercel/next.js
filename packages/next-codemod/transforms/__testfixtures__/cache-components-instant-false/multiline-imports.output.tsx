// @ts-nocheck
import {
  Suspense,
  type ReactNode,
} from 'react'
import {
  foo,
  bar,
} from './lib'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Page({ children }: { children: ReactNode }) {
  return <Suspense>{foo(bar()) || children}</Suspense>
}
