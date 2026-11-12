import { zeroRevalidate } from '../cache'
import { Suspense } from 'react'
export const ensureStatic = 'navigation'
async function Content() {
  return <p>{await zeroRevalidate()}</p>
}
export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content />
    </Suspense>
  )
}
