const generatedSlugs = [{ slug: [] }, { slug: ['known'] }]

export const dynamicParams = false

export function generateStaticParams() {
  return generatedSlugs
}

export default async function Page({
  params,
}: {
  params: Promise<{ slug?: string[] }>
}) {
  const { slug } = await params
  return <p id="optional-catch-all-page">Optional {slug?.join('/')}</p>
}
