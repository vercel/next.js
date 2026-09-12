export const experimental_paramMatching = {
  lang: 'blocking',
  category: 'blocking',
} as const

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string; category: string }>
}) {
  const { lang, category } = await params
  return <p id="specificity-loosen-params">{`${lang}/${category}`}</p>
}
