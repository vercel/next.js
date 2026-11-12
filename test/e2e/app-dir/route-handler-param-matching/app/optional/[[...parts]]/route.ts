import { handler } from '../../respond'

export const unstable_paramMatching = { parts: 'not-found' }
export function generateStaticParams() {
  return [{ parts: [] }, { parts: ['one', 'two'] }]
}
export const GET = handler('GET')
