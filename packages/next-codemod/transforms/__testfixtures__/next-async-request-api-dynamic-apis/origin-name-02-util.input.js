import { cookies } from 'next/headers'

export default function Foo() {
  const name = cookies().get('name')
  return name
}
