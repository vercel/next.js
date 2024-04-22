import { after } from 'next/server'
import { cache } from 'react'
import { persistentLog } from '../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  const valueFromRender = thing()

  const action = async () => {
    'use server'
    after(() => {
      const valueFromAfter = thing()

      console.log(
        [
          '[action] hello from after()',
          '  - ' +
            (valueFromRender === valueFromAfter
              ? 'cache() WORKS in after()!!!'
              : "cache() doesn't work in after() :("),
          '  - ' +
            'headers().get("host"): ' +
            JSON.stringify(headers().get('host')),
        ].join('\n')
      )

      persistentLog({ source: '[id]/with-action action', value: params.id })
    })
  }

  return (
    <div>
      <h1>Page with after() in an action</h1>
      <form action={action}>
        <button type="submit">Submit</button>
      </form>
    </div>
  )
}
