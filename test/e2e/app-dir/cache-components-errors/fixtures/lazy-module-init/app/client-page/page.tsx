'use client'

import { BuildID } from './build-id'

export default function Page() {
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
    </>
  )
}
