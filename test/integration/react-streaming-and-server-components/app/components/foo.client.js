import { useMemo } from 'react'

export default function foo() {
  const value = useMemo(() => 'foo.client', [])
  return value
}
