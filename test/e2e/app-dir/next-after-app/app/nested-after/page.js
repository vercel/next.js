import { unstable_after as after } from 'next/server'
import { cache } from 'react'
import { cliLog } from '../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  const hostFromRender = headers().get('host')
  const valueFromRender = thing()

  after(async () => {
    const hostFromAfter = headers().get('host')
    const valueFromAfter = thing()

    cliLog({
      source: '[page] /nested-after (after #1)',
      assertions: {
        'cache() works in after()': valueFromRender === valueFromAfter,
        'headers() works in after()': hostFromRender === hostFromAfter,
      },
    })

    after(() => {
      const hostFromAfter = headers().get('host')
      const valueFromAfter = thing()

      cliLog({
        source: '[page] /nested-after (after #2)',
        assertions: {
          'cache() works in after()': valueFromRender === valueFromAfter,
          'headers() works in after()': hostFromRender === hostFromAfter,
        },
      })
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    after(() => {
      const hostFromAfter = headers().get('host')
      const valueFromAfter = thing()

      cliLog({
        source: '[page] /nested-after (after #3)',
        assertions: {
          'cache() works in after()': valueFromRender === valueFromAfter,
          'headers() works in after()': hostFromRender === hostFromAfter,
        },
      })
    })
  })

  return <div>Page with nested after()</div>
}
