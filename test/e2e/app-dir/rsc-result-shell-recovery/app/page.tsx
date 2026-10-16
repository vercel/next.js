import { Suspense } from 'react'
import { FailOnSSR } from './fail-on-ssr'

export const dynamic = 'force-dynamic'

async function Future() {
  await new Promise((resolve) => setTimeout(resolve, 20))
  return <p id="future-marker">original hydration future</p>
}

export default function Page() {
  return (
    <FailOnSSR>
      <Suspense fallback={<p>waiting</p>}>
        <Future />
      </Suspense>
    </FailOnSSR>
  )
}
