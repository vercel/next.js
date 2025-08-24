import { cookies, type UnsafeUnwrappedCookies } from 'next/headers';

export default function Foo(): string {
  const name = (cookies() as unknown as UnsafeUnwrappedCookies).get('name')
  return name
}
