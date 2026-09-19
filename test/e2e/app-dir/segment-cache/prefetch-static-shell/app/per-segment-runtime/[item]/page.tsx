import { cookies } from 'next/headers'
import { Suspense } from 'react'

export const instant = {
  unstable_samples: [{ params: { item: 'one' }, cookies: [] }],
}

export function generateStaticParams() {
  return [{ item: 'public' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ item: string }>
}) {
  return (
    <Suspense fallback="Loading account...">
      <Account params={params} />
    </Suspense>
  )
}

async function Account({ params }: { params: Promise<{ item: string }> }) {
  const { item } = await params
  if (item === 'public') {
    return <main>Public item</main>
  }
  const cookieStore = await cookies()
  return (
    <main>{`Account for ${item}: ${cookieStore.get('account')?.value ?? 'guest'}`}</main>
  )
}
