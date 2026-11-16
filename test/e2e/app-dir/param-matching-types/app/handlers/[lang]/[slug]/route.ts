export const unstable_paramMatching = { lang: 'not-found', slug: 'dynamic' }

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export async function GET(
  _request: Request,
  { params }: RouteContext<'/handlers/[lang]/[slug]'>
) {
  return Response.json(await params)
}
