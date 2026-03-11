import type { Instant } from 'next'
import { ParamsReader } from './params-reader'

export const unstable_instant: Instant = {
  prefetch: 'static',
  samples: [
    {
      params: {
        one: '123',
        // two: <missing>
      },
    },
  ],
}

export default function Page() {
  return (
    <main>
      <p>
        This page reads a param via useParams() that is not declared in the
        sample, so it should fail validation with an exhaustiveness error.
      </p>
      <ParamsReader />
    </main>
  )
}
