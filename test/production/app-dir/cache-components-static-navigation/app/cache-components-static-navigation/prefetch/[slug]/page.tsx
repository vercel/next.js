import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { getValue } from '../../../value'

type Props = { params: Promise<{ slug: string }> }

export const prefetch = 'partial'

// Unknown slugs block, so the build derives prefetch hints from the
// cookie-dependent example instead of a fallback shell. These hints make the
// client router use runtime prefetches, even for fully static ISR entries.
export const unstable_paramMatching = { slug: 'blocking' } as const

export function generateStaticParams() {
  return [{ slug: 'dynamic' }]
}

async function Content({ params }: Props) {
  const { slug } = await params
  if (slug === 'dynamic') {
    await cookies()
  }
  return <p id="value">{await getValue('prefetch', slug)}</p>
}

export default function Page(props: Props) {
  return (
    <Suspense fallback="Loading prefetched content...">
      <Content {...props} />
    </Suspense>
  )
}
