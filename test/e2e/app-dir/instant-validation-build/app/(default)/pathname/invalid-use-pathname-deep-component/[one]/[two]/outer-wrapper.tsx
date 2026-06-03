'use client'

import { MiddleWrapper } from './middle-wrapper'

export function OuterWrapper() {
  return (
    <section>
      <MiddleWrapper />
    </section>
  )
}
