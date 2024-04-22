import { unstable_after as after } from 'next/server'
import { cache } from 'react'
import { persistentLog } from '../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  const valueFromRender = thing()

  after(async () => {
    const valueFromAfter = thing()

    console.log(
      [
        '[page] hello from after()',
        '  - ' +
          (valueFromRender === valueFromAfter
            ? 'cache() WORKS in after()!!!'
            : "cache() doesn't work in after() :("),
        '  - ' +
          'headers().get("host"): ' +
          JSON.stringify(headers().get('host')),
      ].join('\n')
    )

    persistentLog({ source: '[id] page', value: params.id })
  })

  return <div>Page with after()</div>
}
