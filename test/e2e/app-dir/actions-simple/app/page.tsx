import { Form } from './form'
import { foo } from './actions'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>server component page</h1>
      <Form action={foo} />
      <Link href="/client">client component page</Link>
    </main>
  )
}
