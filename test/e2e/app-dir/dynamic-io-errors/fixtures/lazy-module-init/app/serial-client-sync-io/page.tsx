import { BuildID } from './build-id'
import Indirection from './indirection'
import { date as date1 } from './client-lazy-now-1'
import { date as date2 } from './client-lazy-now-2'
import { date as date3 } from './client-lazy-now-3'

export default async function Page() {
  return (
    <>
      <p>
        This page requires a module lazily during rendering. The Module computes
        a "static" id using the current time and a random number. If these APIs
        are used while prerendering they would normally trigger a synchronous
        dynamic bailout. However since these APIs are used in module scope they
        are not semantically part of the render and should be usable like other
        "static" values. We demonstrate this with this fixture by asserting that
        this page still produces a static result and it does not warn for
        reading current time and random in a prerender.
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
