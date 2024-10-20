import { Form } from './form'
import defaultAction1, { foo, bar, baz, qux } from './actions1'
import defaultAction2 from './actions2'
import defaultAction3 from './actions3'
import Link from 'next/link'
import { ServerComponent } from './server-component'

export default function Page() {
  const action1 = async () => {
    'use server'

    return 'declarator arrow function expression'
  }

  async function action2() {
    'use server'

    return 'function declaration'
  }

  return (
    <main>
      <ServerComponent />
      <Form id="form-1" action={defaultAction1} />
      <Form id="form-2" action={defaultAction2} />
      <Form id="form-3" action={defaultAction3} />
      <Form id="form-4" action={foo} />
      <Form id="form-5" action={bar} />
      <Form id="form-6" action={baz} />
      <Form id="form-7" action={qux} />
      <Form id="form-8" action={action1} />
      <Form id="form-9" action={action2} />
      <Form
        id="form-10"
        action={async () => {
          'use server'

          return 'arrow function expression'
        }}
      />
      <Form
        id="form-11"
        action={async function () {
          'use server'

          return 'anonymous function expression'
        }}
      />
      <Form
        id="form-12"
        action={async function myAction() {
          'use server'

          return 'named function expression'
        }}
      />
      <Link href="/client">client component page</Link>
    </main>
  )
}
