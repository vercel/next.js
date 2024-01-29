import { Suspense } from 'react'
import { Optimistic } from '../../../components/optimistic'
import { ServerHtml } from '../../../components/server-html'

export const dynamic = 'force-dynamic'

export default () => {
  return (
    <>
      <ServerHtml />
      <Suspense fallback="loading...">
        <Optimistic />
      </Suspense>
    </>
  )
}
