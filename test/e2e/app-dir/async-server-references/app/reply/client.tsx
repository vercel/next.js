'use client'
import { useActionState } from 'react'
import { runActionFromArgument, myAction } from './async-module-with-actions'

export function Client() {
  const [state, dispatch, isPending] = useActionState(async () => {
    try {
      // This will execute the action passsed as an argument,
      // and throw if something goes wrong.
      await runActionFromArgument(myAction)
      return 'ok'
    } catch (err) {
      return 'error'
    }
  }, null)
  return (
    <div>
      <form action={dispatch}>
        <button type="submit">Submit</button>
      </form>
      {isPending
        ? 'Submitting...'
        : state !== null && <div id="action-result">{state}</div>}
    </div>
  )
}
