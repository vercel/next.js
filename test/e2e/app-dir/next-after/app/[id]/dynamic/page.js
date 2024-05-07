import { unstable_after as after } from 'next/server'
import { cache } from 'react'
import { persistentLog } from '../../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  const hostFromRender = headers().get('host')
  const valueFromRender = thing()

  after(() => {
    const hostFromAfter = headers().get('host')
    const valueFromAfter = thing()

    persistentLog({
      source: '[page] /[id]/dynamic',
      value: params.id,
      assertions: {
        'cache() works in after()': valueFromRender === valueFromAfter,
        'headers() works in after()': hostFromRender === hostFromAfter,
      },
    })
  })

  return <div>Page with after()</div>
}
