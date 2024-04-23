import { unstable_after as after } from 'next/server'
import { cache } from 'react'
import { persistentLog } from '../../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  const action = async () => {
    'use server'
    const cachedValue1 = thing()
    after(() => {
      const cachedValue2 = thing()

      console.log(
        [
          '[action] hello from after()',
          '  - ' +
            (cachedValue2 === cachedValue1
              ? 'cache() WORKS in after()!!!'
              : "cache() doesn't work in after() :("),
          '  - ' +
            'headers().get("host"): ' +
            JSON.stringify(headers().get('host')),
        ].join('\n')
      )

      persistentLog({ source: '[action] /[id]/with-action', value: params.id })
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
