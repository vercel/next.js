export const unstable_matcher = {
  top: 'dynamic',
  bottom: 'dynamic',
}

export function generateStaticParams() {
  return [{ top: 't1' }]
}

export default async function Page({ params }) {
  return <p>{JSON.stringify(await params)}</p>
}
