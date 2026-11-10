export const dynamicParams = false

export function generateStaticParams() {
  return [
    { slug: ['docs', 'space here', '100%'] },
    { slug: ['docs', 'space here', 'with/slash', '100%'] },
  ]
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params

  return <div>params.slug is {slug.join('/')}</div>
}
