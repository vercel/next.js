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
