export default async function Page() {
  // forced port: 7777
  const fetchResponse = await fetch('http://localhost:7777/set-cookies')
  const cookies = fetchResponse.headers.getSetCookie()
  // should be ['foo=foo', 'bar=bar']
  return <p>{JSON.stringify(cookies)}</p>
}
