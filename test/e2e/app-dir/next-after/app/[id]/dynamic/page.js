import { unstable_after as after } from 'next/server'
import { cache } from 'react'
import { persistentLog } from '../../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  headers()
  const valueFromRender = thing()

  after(async () => {
    const valueFromAfter = thing()

    console.log(
      [
        '[page] /[id]/dynamic',
        '  - ' +
          (valueFromRender === valueFromAfter
            ? 'cache() WORKS in after()!!!'
            : "cache() doesn't work in after() :("),
        '  - ' +
          'headers().get("host"): ' +
          JSON.stringify(headers().get('host')),
      ].join('\n')
    )

    persistentLog({ source: '[page] /[id]/dynamic', value: params.id })
  })

  return <div>Page with after()</div>
}
