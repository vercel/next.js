export function generateStaticParams() {
  return [{ siteName: 'a' }, { siteName: 'b' }]
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteName: string }> }
) {
  const { siteName } = await params
  return new Response(`gsp-site=${siteName}`, {
    headers: { 'Content-Type': 'application/xml' },
  })
}
