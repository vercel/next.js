// @ts-nocheck
import { Suspense } from 'react'
import { foo } from './bar'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface Props {
  id: string
}

export default function Page({ id }: Props) {
  return <Suspense>{foo(id)}</Suspense>
}
