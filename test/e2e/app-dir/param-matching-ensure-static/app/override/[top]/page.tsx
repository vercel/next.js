export { default } from '../../param-page'
export const ensureStatic = 'navigation'

export async function unstable_generateParamMatching() {
  return { top: 'blocking' }
}

export function generateStaticParams() {
  return [{ top: 't1' }]
}
