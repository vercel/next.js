import { connection } from 'next/server'
import { submitState } from '../actions'
import { StateForm } from '../state-form'

async function readRequest() {
  await connection()
  return 'Request data'
}

// The form does not read its request prop during SSR. HTML can finish while
// Flight still waits for request data.
export default function Page() {
  return (
    <StateForm
      name="data"
      action={submitState.bind(null, 'data')}
      request={readRequest()}
    />
  )
}
