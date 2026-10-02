// @ts-nocheck
import {
  Suspense,
  type ReactNode,
} from 'react'
import {
  foo,
  bar,
} from './lib'

export default function Page({ children }: { children: ReactNode }) {
  return <Suspense>{foo(bar()) || children}</Suspense>
}
