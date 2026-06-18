export default async function Page() {
  const res = await fetch('http://example.com', { cache: 'no-store' })
  return <p>Status: {res.status}</p>
}
