export { default } from '../../../param-page'
export const unstable_ensureStatic = 'navigation'

export function generateStaticParams() {
  return [{ top: 't1', bottom: 'b1' }]
}
