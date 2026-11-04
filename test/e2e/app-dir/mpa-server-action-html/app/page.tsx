import { Suspense } from 'react'
import {
  submitState,
  submitPlain,
  submitNotFound,
  invalidateState,
} from './actions'
import { StateForm } from './state-form'
import { readValue } from './read-value'
import { RequestContent } from './request-content'

export default async function Page() {
  const value = await readValue('content')
  return (
    <>
      <p id="content-value">{value}</p>
      <StateForm name="static" action={submitState.bind(null, 'static')} />
      <StateForm name="invalidate" action={invalidateState} />
      <form action={submitPlain.bind(null, 'bound')}>
        <input id="plain-message" name="message" defaultValue="Ada" />
        <button id="submit-plain">Submit plain form</button>
      </form>
      <form action={submitNotFound}>
        <button id="submit-not-found">Return not found</button>
      </form>
      <Suspense fallback={<p>Loading request content</p>}>
        <RequestContent />
      </Suspense>
    </>
  )
}
