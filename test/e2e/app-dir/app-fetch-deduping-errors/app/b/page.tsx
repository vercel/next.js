export default async function Page() {
  const res = await fetch('not-a-url/data.json', {
    next: { revalidate: 60 },
  }).catch(() => null)

  return <p>{res ? 'ok' : 'fallback'}</p>
}
