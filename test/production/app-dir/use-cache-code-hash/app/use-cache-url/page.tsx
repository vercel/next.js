export default async function Page() {
  'use cache'

  const url = new URL('./asset.txt', import.meta.url)
  return <p>{url.href}</p>
}
