export async function generateStaticParams() {
  return [{ slug: 'alpha' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  'use cache'
  const { slug } = await params
  await new Promise((resolve) => setTimeout(resolve, 2000))

  return <div id="slug">Hi {slug}</div>
}
