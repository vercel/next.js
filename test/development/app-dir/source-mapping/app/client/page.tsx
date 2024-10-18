'use client'

import { Form } from '../form'
import defaultAction, { bar } from '../actions'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>client component page</h1>
      <Form action={defaultAction} />
      <Form action={bar} />
      <Link href="/">server component page</Link>
    </main>
  )
}
