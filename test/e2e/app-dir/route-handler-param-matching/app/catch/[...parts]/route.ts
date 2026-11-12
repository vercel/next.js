import { handler } from '../../respond'

export async function unstable_generateParamMatching() {
  return { parts: 'not-found' }
}
export function generateStaticParams() {
  return [
    { parts: ['a', 'b'] },
    { parts: ['100%', 'a/b'] },
    { parts: ['a,b', 'c'] },
    { parts: ['a', 'b,c'] },
  ]
}
export const GET = handler('GET')
