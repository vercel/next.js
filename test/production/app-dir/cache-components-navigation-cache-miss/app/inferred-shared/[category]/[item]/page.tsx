import { Suspense } from 'react'
import { prerenderGate } from '../../../prerender-gate'
import { Params } from './params'

export default async function Page() {
  await prerenderGate('inferred-shared')
  return (
    <>
      <p>Complete shared shell</p>
      <Suspense fallback={<p>Loading params</p>}>
        <Params />
      </Suspense>
    </>
  )
}
