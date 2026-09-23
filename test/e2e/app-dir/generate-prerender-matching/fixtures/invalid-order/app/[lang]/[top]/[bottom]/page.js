export const experimental_paramMatching = {
  lang: 'blocking',
}

export function generateStaticParams() {
  return [{ lang: 'en', top: 't1', bottom: 'b1' }]
}

export default async function Page({ params }) {
  return <p>{JSON.stringify(await params)}</p>
}
