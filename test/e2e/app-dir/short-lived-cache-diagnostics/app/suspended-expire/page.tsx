import { shortExpire } from '../cache'
import { Suspense } from 'react'
export const instant = true
async function Content() {
  return <p>{await shortExpire()}</p>
}
export default function Page() {
  return (
    <Suspense fallback={<p>Loading</p>}>
      <Content />
    </Suspense>
  )
}
