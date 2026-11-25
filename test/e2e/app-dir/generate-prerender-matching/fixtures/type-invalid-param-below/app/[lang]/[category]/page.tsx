export function generateStaticParams() {
  return [{ lang: 'en', category: 'shoes' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string }>
}) {
  return <p>{JSON.stringify(await params)}</p>
}
