// @ts-nocheck
import { Suspense } from 'react'
import { foo } from './bar'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface Props {
  id: string
}

export default function Page({ id }: Props) {
  return <Suspense>{foo(id)}</Suspense>
}
