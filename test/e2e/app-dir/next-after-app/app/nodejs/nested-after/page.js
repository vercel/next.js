import { after, connection } from 'next/server'
import { cache } from 'react'
import { cliLog } from '../../../utils/log'

const thing = cache(() => Symbol('cache me please'))

export default async function Index(props) {
  await connection()
  const valueFromRender = thing()

  after(async () => {
    const valueFromAfter = thing()

    cliLog({
      source: '[page] /nested-after (after #1)',
      assertions: {
        'cache() works in after()': valueFromRender === valueFromAfter,
      },
    })

    after(() => {
      const valueFromAfter = thing()

      cliLog({
        source: '[page] /nested-after (after #2)',
        assertions: {
          'cache() works in after()': valueFromRender === valueFromAfter,
        },
      })
    })

    await new Promise((resolve) => setTimeout(resolve, 500))

    after(() => {
      const valueFromAfter = thing()

      cliLog({
        source: '[page] /nested-after (after #3)',
        assertions: {
          'cache() works in after()': valueFromRender === valueFromAfter,
        },
      })
    })
  })

  return <div>Page with nested after()</div>
}
