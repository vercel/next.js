import { Suspense } from 'react'

export const experimental_paramMatching = {
  lang: 'not-found',
  slug: 'fallback',
} as const

export function generateStaticParams() {
  return [{ lang: 'en', slug: 'allowed' }]
}

export default function Page({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  return (
    <>
      <p>Mixed parameter policies</p>
      <Suspense fallback={<p>Loading product</p>}>
        <Product params={params} />
      </Suspense>
    </>
  )
}

async function Product({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>
}) {
  const { lang, slug } = await params
  return <p id="mixed-params">{`${lang}/${slug}`}</p>
}
