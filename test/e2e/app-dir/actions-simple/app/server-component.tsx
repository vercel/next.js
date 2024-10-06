import { headers, UnsafeUnwrappedHeaders } from 'next/headers'

export function ServerComponent() {
  console.log((headers() as unknown as UnsafeUnwrappedHeaders).get('foo'))

  return <h1>server component</h1>
}
