import { BuildID } from './build-id'
import Indirection from './indirection'
import { date as date1 } from './client-lazy-now-1'
import { date as date2 } from './client-lazy-now-2'
import { date as date3 } from './client-lazy-now-3'

export default async function Page() {
  return (
    <>
      <p>
        This page has several client modules that have sync IO in the module
        scope that will run in serial when prerendering to HTML. The point of
        this test is to assert that the serial nature does not lead to
        unexpected sync IO errors. In the past this particular setup would show
        up as a sync IO error because the later modules did not initialize
        during the prospective render and thus appeared to use sync IO when
        being initialized during the final render.
      </p>
      <BuildID />
      <Indirection>
        <p>Date 1: {date1}</p>
      </Indirection>
      <Indirection>
        <p>Date 2: {date2}</p>
      </Indirection>
      <Indirection>
        <p>Date 3: {date3}</p>
      </Indirection>
    </>
  )
}
