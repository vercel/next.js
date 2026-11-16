import Link from 'next/link'

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return <Link href={`/${lang}/products`}>Products</Link>
}
