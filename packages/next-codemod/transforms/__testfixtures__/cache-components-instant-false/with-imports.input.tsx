// @ts-nocheck
import { Suspense } from 'react'
import { foo } from './bar'

interface Props {
  id: string
}

export default function Page({ id }: Props) {
  return <Suspense>{foo(id)}</Suspense>
}
