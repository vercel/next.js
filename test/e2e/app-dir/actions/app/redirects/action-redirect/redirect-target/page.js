import { cookies } from 'next/headers'

export default function Page() {
  const foo = cookies().get('foo')
  const bar = cookies().get('bar')
  return (
    <div>
      <h1>
        foo={foo ? foo.value : ''}; bar={bar ? bar.value : ''}
      </h1>
    </div>
  )
}
