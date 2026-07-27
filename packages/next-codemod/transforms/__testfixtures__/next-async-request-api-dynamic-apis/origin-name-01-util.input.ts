import { cookies } from 'next/headers'

export default function Foo(): string {
  const name = cookies().get('name')
  return name
}
