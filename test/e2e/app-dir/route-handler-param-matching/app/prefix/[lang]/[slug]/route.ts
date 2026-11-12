import { cookies } from 'next/headers'

export const unstable_paramMatching = { lang: 'not-found', slug: 'dynamic' }
export function generateStaticParams() {
  return ['en', '日本語', '100%', 'with space', 'a/b', '[id]', 'a[x]b'].map(
    (lang) => ({ lang })
  )
}
async function cachedToken(lang: string) {
  'use cache'
  return { lang, value: Math.random() }
}
export async function GET(
  _request: Request,
  { params }: RouteContext<'/prefix/[lang]/[slug]'>
) {
  const values = await params
  console.log(`handler-called:GET:${JSON.stringify(values)}`)
  return Response.json({
    params: values,
    cookie: (await cookies()).get('request-value')?.value,
    cached: await cachedToken(values.lang),
  })
}
