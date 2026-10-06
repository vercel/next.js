export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  return <h1>{slug ? `Page /${slug.join('/')}` : 'Index page'}</h1>
}
