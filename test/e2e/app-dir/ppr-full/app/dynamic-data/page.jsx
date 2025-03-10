import { Suspense } from 'react'
import { Optimistic } from '../../components/optimistic'
import { ServerHtml } from '../../components/server-html'

export default (props) => {
  return (
    <>
      <ServerHtml />
      <Suspense fallback="loading...">
        <Optimistic searchParams={props.searchParams} />
      </Suspense>
    </>
  )
}
