// @ts-nocheck
import {
  Suspense,
  type ReactNode,
} from 'react'
import {
  foo,
  bar,
} from './lib'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Page({ children }: { children: ReactNode }) {
  return <Suspense>{foo(bar()) || children}</Suspense>
}
