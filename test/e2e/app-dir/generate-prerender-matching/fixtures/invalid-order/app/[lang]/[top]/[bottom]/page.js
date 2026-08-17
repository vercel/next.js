export const unstable_matcher = {
  lang: 'fallback',
  top: 'not-found',
}

export function generateStaticParams() {
  return [{ lang: 'en', top: 't1', bottom: 'b1' }]
}

export default async function Page({ params }) {
  return <p>{JSON.stringify(await params)}</p>
}
