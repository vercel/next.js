'use client'

import { Form } from '../form'
import defaulAction1, { foo, bar, baz, qux } from '../actions1'
import defaulAction2 from '../actions2'
import defaulAction3 from '../actions3'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>client component page</h1>
      <Form action={defaulAction1} />
      <Form action={defaulAction2} />
      <Form action={defaulAction3} />
      <Form action={foo} />
      <Form action={bar} />
      <Form action={baz} />
      <Form action={qux} />
      <Link href="/">server component page</Link>
    </main>
  )
}
