export default async function Page() {
  const res = await fetch('https://example.com/data', { cache: 'no-store' })
  return <p>{res.status}</p>
}
