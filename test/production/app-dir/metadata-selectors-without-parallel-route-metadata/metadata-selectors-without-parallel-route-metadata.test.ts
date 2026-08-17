import { nextTestSetup } from 'e2e-utils'
import stripAnsi from 'next/dist/compiled/strip-ansi'

describe('metadata-selectors-without-parallel-route-metadata', () => {
  const { next } = nextTestSetup({
    files: __dirname,
  })

  it('warns that metadata selectors are ignored when parallel metadata is disabled', () => {
    expect(stripAnsi(next.cliOutput)).toContain(
      'The `unstable_selectMetadata` and `unstable_selectViewport` exports in "./app/layout.tsx" require `experimental.parallelRouteMetadata: true` in next.config.js. These exports will be ignored.'
    )
  })
})
