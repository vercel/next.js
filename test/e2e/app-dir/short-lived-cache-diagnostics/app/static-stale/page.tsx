import { unprefetchable } from '../cache'
import { Suspense } from 'react'
export const ensureStatic = 'navigation'
async function Content() {
  return <p>{await unprefetchable()}</p>
}
export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content />
    </Suspense>
  )
}
