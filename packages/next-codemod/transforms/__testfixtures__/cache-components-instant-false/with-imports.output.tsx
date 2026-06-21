// @ts-nocheck
import { Suspense } from 'react'
import { foo } from './bar'

// TODO: Cache Components adoption. Remove once this route navigates instantly.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface Props {
  id: string
}

export default function Page({ id }: Props) {
  return <Suspense>{foo(id)}</Suspense>
}
