// The child generateStaticParams returns a non-empty array for one parent
// value (`en`) and an empty array for another (`fr`). The `en` pages should
// still be prerendered; `fr` simply contributes no static children.
export function generateStaticParams({ params }: { params: { lang: string } }) {
  return params.lang === 'en'
    ? [
        { lang: params.lang, slug: 'a' },
        { lang: params.lang, slug: 'b' },
      ]
    : []
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
