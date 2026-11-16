import { cookies } from 'next/headers'

export const unstable_paramMatching = { lang: 'not-found' }

export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'ja', slug: 'seed' }]
}

export async function GET(
  _request: Request,
  { params }: RouteContext<'/mixed/[lang]/[slug]'>
) {
  const values = await params
  console.log(`handler-called:GET:${JSON.stringify(values)}`)
  return Response.json({
    params: values,
    cookie: (await cookies()).get('request-value')?.value,
  })
}
