import { Form } from 'components'

async function Component({ a }) {
  const b = 1

  async function action(c) {
    'use server'
    const d = a + b + c

    async function cache(e) {
      'use cache'
      const f = d + e

      return [f, { a }]
    }

    return cache(d)
  }

  return (
    <Form action={action}>
      <button>Submit</button>
    </Form>
  )
}
