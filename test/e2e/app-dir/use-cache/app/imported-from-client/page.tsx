'use client'

import { foo, bar, baz } from './cached'
import { Form } from '../form'

export default function Page() {
  return <Form foo={foo} bar={bar} baz={baz} />
}
