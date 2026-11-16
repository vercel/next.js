import { handler } from '../../../respond'

export const unstable_paramMatching = { lang: 'not-found', slug: 'not-found' }
export function generateStaticParams() {
  return [
    { lang: 'en', slug: 'first' },
    { lang: 'es', slug: 'second' },
  ]
}
export const GET = handler('GET')
export const HEAD = handler('HEAD')
export const POST = handler('POST')
export const PUT = handler('PUT')
export const DELETE = handler('DELETE')
export const PATCH = handler('PATCH')
export const OPTIONS = handler('OPTIONS')
