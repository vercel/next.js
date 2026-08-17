export const unstable_matcher = { lang: 'not-found' }

export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default async function Page({ params }) {
  return <p>{JSON.stringify(await params)}</p>
}
