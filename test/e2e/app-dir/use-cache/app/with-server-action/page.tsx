// TODO: This should not need the suspense boundary in the root layout, but
// currently does with Turbopack.
import { Form } from './form'

async function action() {
  'use server'

  return 'result'
}

export default async function Page() {
  'use cache'

  return (
    <Form action={action}>
      <p>{Date.now()}</p>
    </Form>
  )
}
