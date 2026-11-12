export const unstable_paramMatching = { slug: 'not-found' } as const

export function generateStaticParams() {
  return [{ slug: 'a' }, { slug: 'b' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  return <h1 id="static-param">{`Static param ${slug}`}</h1>
}
