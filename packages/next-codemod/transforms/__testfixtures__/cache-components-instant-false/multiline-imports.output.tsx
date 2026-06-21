// @ts-nocheck
import {
  Suspense,
  type ReactNode,
} from 'react'
import {
  foo,
  bar,
} from './lib'

// TODO: Cache Components adoption. Remove once this route navigates instantly.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default function Page({ children }: { children: ReactNode }) {
  return <Suspense>{foo(bar()) || children}</Suspense>
}
