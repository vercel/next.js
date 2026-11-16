import { handler } from '../../../respond'
export const unstable_paramMatching = { lang: 'not-found' }
export function generateStaticParams() {
  return [{ lang: 'en', slug: 'seed' }]
}
export const GET = handler('GET')
export const HEAD = handler('HEAD')
