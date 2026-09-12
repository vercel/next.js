export async function experimental_generateParamMatching() {
  return { bottom: 'fallback' } as const
}

export function generateStaticParams() {
  return [{ bottom: 'seed' }]
}

export { default } from '../../../param-page'
