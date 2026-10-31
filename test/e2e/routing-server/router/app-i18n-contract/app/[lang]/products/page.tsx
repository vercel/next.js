import Link from 'next/link'

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { lang } = await params
  return (
    <>
      <p id="page-language">{lang}</p>
      <pre id="query">{JSON.stringify(await searchParams)}</pre>
      <Link id="details" prefetch={false} href={`/${lang}/products/details`}>
        Details
      </Link>
    </>
  )
}
