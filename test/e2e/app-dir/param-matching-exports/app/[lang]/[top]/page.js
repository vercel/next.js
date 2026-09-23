export function generateStaticParams() {
  return [{ lang: 'en', top: 't1' }]
}

export default async function Page({ params }) {
  const { lang, top } = await params
  return <p>{`${lang}/${top}`}</p>
}
