'use client'

import { foo, bar, baz } from './cached'
import { Form } from '../../form'

export function ClientComponent() {
  return <Form foo={foo} bar={bar} baz={baz} />
}
