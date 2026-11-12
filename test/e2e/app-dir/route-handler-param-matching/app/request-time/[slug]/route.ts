import { cookies } from 'next/headers'

export const unstable_paramMatching = { slug: 'not-found' }
export function generateStaticParams() {
  return [{ slug: 'allowed' }]
}
export async function GET(
  _request: Request,
  { params }: RouteContext<'/request-time/[slug]'>
) {
  const values = await params
  console.log(`handler-called:GET:${JSON.stringify(values)}`)
  return Response.json({
    params: values,
    cookie: (await cookies()).get('request-value')?.value,
  })
}
