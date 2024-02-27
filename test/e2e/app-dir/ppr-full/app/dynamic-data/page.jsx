import { Suspense } from 'react'
import { Optimistic } from '../../components/optimistic'
import { ServerHtml } from '../../components/server-html'

export default ({ searchParams }) => {
  return (
    <>
      <ServerHtml />
      <Suspense fallback="loading...">
        <Optimistic searchParams={searchParams} />
      </Suspense>
    </>
  )
}
