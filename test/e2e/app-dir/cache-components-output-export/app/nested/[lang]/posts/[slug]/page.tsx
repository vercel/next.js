export function generateStaticParams({ params }: { params: { lang: string } }) {
  return [{ slug: `${params.lang}-first` }]
}

// Awaiting params blocks the app shell; this fixture tests complete exports.
export const instant = false

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  return (
    <p id="nested">
      Nested: {lang}/{slug}
    </p>
  )
}
