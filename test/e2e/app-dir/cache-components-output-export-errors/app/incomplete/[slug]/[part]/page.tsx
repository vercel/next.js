export function generateStaticParams() {
  return [{ slug: 'first' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; part: string }>
}) {
  const { slug, part } = await params
  return (
    <p>
      {slug}/{part}
    </p>
  )
}
