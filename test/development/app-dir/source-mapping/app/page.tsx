import { Form } from './form'
import defaulAction1, { foo, bar, baz, qux } from './actions1'
import defaulAction2 from './actions2'
import defaulAction3 from './actions3'
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
      <Form action={defaulAction1} />
      <Form action={defaulAction2} />
      <Form action={defaulAction3} />
      <Form action={foo} />
      <Form action={bar} />
      <Form action={baz} />
      <Form action={qux} />
      <Form action={action1} />
      <Form action={action2} />
      <Form
        action={async () => {
          'use server'

          return 'arrow function expression'
        }}
      />
      <Form
        action={async function () {
          'use server'

          return 'anonymous function expression'
        }}
      />
      <Form
        action={async function myAction() {
          'use server'

          return 'named function expression'
        }}
      />
      <Link href="/client">client component page</Link>
    </main>
  )
}
