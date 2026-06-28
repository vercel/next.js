// Positive control: the child generateStaticParams returns the same non-empty
// set for *every* parent value, so all four pages must prerender.
export function generateStaticParams({ params }: { params: { lang: string } }) {
  return [
    { lang: params.lang, slug: 'a' },
    { lang: params.lang, slug: 'b' },
  ]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  return (
    <div>
      {lang} {slug}
    </div>
  )
}
