import { unstable_after as after } from 'next/server'
import { cache } from 'react'
import { persistentLog } from '../../../utils/log'
import { headers } from 'next/headers'

const thing = cache(() => Symbol('cache me please'))

export default function Index({ params }) {
  const action = async () => {
    'use server'

    const hostFromAction = headers().get('host')
    const valueFromAction = thing()

    after(() => {
      const valueFromAfter = thing()
      const hostFromAfter = headers().get('host')

      persistentLog({
        source: '[action] /[id]/with-action',
        value: params.id,
        assertions: {
          'cache() works in after()': valueFromAction === valueFromAfter,
          'headers() works in after()': hostFromAction === hostFromAfter,
        },
      })
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
