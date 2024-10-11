'use client'

import { Form } from '../form'
import { bar } from '../actions'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>client component page</h1>
      <Form action={bar} />
      <Link href="/">server component page</Link>
    </main>
  )
}
