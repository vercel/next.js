export function generateStaticParams() {
  return [{ lang: 'en-US' }, { lang: 'nl-NL' }]
}

export default async function Page({
  params,
}: {
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params

  return <p id="app-locale">{lang}</p>
}
