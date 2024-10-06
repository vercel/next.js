import { Form } from './form'
import { foo } from './actions'
import Link from 'next/link'
import { ServerComponent } from './server-component'

export default function Page() {
  return (
    <main>
      <ServerComponent />
      <Form action={foo} />
      <Link href="/client">client component page</Link>
    </main>
  )
}
