export default async function Page() {
  const res = await fetch('https://httpbin.org/status/204')

  return <p>{res.ok ? 'ok' : 'error'}</p>
}
