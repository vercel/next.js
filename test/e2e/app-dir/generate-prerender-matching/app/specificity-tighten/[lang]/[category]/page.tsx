export const experimental_paramMatching = {
  lang: 'not-found',
  category: 'not-found',
} as const

export function generateStaticParams() {
  return [{ lang: 'en', category: 'shoes' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string }>
}) {
  const { lang, category } = await params
  return <p id="specificity-tighten-params">{`${lang}/${category}`}</p>
}
