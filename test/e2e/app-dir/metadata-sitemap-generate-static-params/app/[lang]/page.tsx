export function generateStaticParams() {
  return [{ lang: 'en' }, { lang: 'zh' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  return <p>lang: {lang}</p>
}
