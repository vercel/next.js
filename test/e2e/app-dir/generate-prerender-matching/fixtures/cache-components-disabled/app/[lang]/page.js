export const unstable_matcher = { lang: 'fallback' }

export default async function Page({ params }) {
  return <p>{JSON.stringify(await params)}</p>
}
