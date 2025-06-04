import { cookies, headers } from 'next/headers'

export default async function Page({ searchParams }) {
  const foo = (await cookies()).get('foo')
  const bar = (await cookies()).get('bar')
  const actionHeader = (await headers()).get('next-action')
  if (actionHeader) {
    throw new Error('Action header should not be present')
  }
  return (
    <div>
      <h1>
        foo={foo ? foo.value : ''}; bar={bar ? bar.value : ''}
      </h1>
      <h2>baz={(await searchParams).baz ?? ''}</h2>
    </div>
  )
}
