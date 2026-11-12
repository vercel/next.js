export const unstable_paramMatching = { lang: 'not-found' }

export async function unstable_generateParamMatching() {
  return { lang: 'not-found' }
}

export function GET() {
  return new Response('duplicate matching exports')
}
