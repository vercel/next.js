// The route pattern is fine. One of its generated params names the pathname
// that routing reserves for a rejected request.
export function generateStaticParams() {
  return [{ slug: ['ordinary'] }, { slug: ['__variants', 'not-routed'] }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params

  return <p id="slug">{slug.join('/')}</p>
}
