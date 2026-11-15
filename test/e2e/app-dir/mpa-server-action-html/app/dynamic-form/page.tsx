import { Suspense } from 'react'
import { connection } from 'next/server'
import { submitState } from '../actions'
import { StateForm } from '../state-form'

async function DynamicForm() {
  await connection()
  return <StateForm name="dynamic" action={submitState.bind(null, 'dynamic')} />
}

export default function Page() {
  return (
    <Suspense fallback={<p>Loading form</p>}>
      <DynamicForm />
    </Suspense>
  )
}
