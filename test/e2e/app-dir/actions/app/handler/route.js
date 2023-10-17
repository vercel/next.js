import { cookies } from 'next/headers'

export const GET = async () => {
  cookies().set('foo', 'foo1')
  cookies().set('bar', 'bar1')

  // Key, value, options
  cookies().set('test1', 'value1', { secure: true })

  // One object
  cookies().set({
    name: 'test2',
    value: 'value2',
    httpOnly: true,
    path: '/handler',
  })

  // Cookies here will be merged with the ones above
  return new Response('Hello, world!', {
    headers: [
      ['Content-Type', 'text/custom'],
      ['Set-Cookie', 'bar=bar2'],
      ['Set-Cookie', 'baz=baz2'],
    ],
  })
}
