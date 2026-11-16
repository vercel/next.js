import { handler } from '../../../respond'
export const unstable_paramMatching = { lang: 'not-found' }
export function generateStaticParams() {
  return [{ lang: 'en' }]
}
export const GET = handler('GET')
