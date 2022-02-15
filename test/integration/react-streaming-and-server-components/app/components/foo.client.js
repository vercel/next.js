import { useState } from 'react'

export default function Foo() {
  const [value] = useState('foo.client')
  return value
}

export const config = 'this is not page config'
