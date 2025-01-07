'use client'

import { Form } from '../form'
import defaultAction1, { foo, bar, baz, qux } from '../actions1'
import defaultAction2 from '../actions2'
import defaultAction3 from '../actions3'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>client component page</h1>
      <Form id="form-1" action={defaultAction1} />
      <Form id="form-2" action={defaultAction2} />
      <Form id="form-3" action={defaultAction3} />
      <Form id="form-4" action={foo} />
      <Form id="form-5" action={bar} />
      <Form id="form-6" action={baz} />
      <Form id="form-7" action={qux} />
      <Link href="/">server component page</Link>
    </main>
  )
}
