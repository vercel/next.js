'use client'

import { Form } from '../form'
import { foo } from '../actions'
import Link from 'next/link'

export default function Page() {
  return (
    <main>
      <h1>client component page</h1>
      <Form action={foo} />
      <Link href="/">server component page</Link>
    </main>
  )
}
