export default async function Page() {
  'use cache'

  const { value } = await import('./dependency')
  return <p>{value}</p>
}
