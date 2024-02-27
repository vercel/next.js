import { Suspense, unstable_postpone as postpone } from 'react'
import { Optimistic } from '../../../components/optimistic'
import { ServerHtml } from '../../../components/server-html'

export default ({ searchParams }) => {
  return (
    <>
      <ServerHtml />
      <Suspense fallback="loading...">
        <Optimistic searchParams={searchParams} />
      </Suspense>
      <Suspense fallback="loading...">
        <IncidentalPostpone />
      </Suspense>
    </>
  )
}

function IncidentalPostpone() {
  // This component will postpone but is not using
  // any dynamic APIs so we expect it to simply client render
  if (typeof window === 'undefined') {
    postpone('incidentally')
  }
  return <div>Incidental</div>
}
