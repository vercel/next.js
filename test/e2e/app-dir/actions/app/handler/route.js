import { cookies } from 'next/headers'

export const GET = async () => {
  cookies().set('foo', 'foo1')
  cookies().set('bar', 'bar1')
  return new Response('Hello, world!', {
    headers: [
      ['Set-Cookie', 'bar=bar2'],
      ['Set-Cookie', 'baz=baz2'],
    ],
  })
}
