import { cookies } from 'next/headers'

export default function Page({ searchParams }) {
  const foo = cookies().get('foo')
  const bar = cookies().get('bar')
  return (
    <div>
      <h1>
        foo={foo ? foo.value : ''}; bar={bar ? bar.value : ''}
      </h1>
      <h2>baz={searchParams.baz ?? ''}</h2>
    </div>
  )
}
