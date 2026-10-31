export default async function Page() {
  'use cache'
  return <p>{new Date().toISOString()}</p>
}
