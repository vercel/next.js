const generatedSlugs = [{ slug: ['one'] }, { slug: ['one', 'two'] }]

export const dynamicParams = false

export function generateStaticParams() {
  return generatedSlugs
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  return <p id="catch-all-page">Catch all {slug.join('/')}</p>
}
