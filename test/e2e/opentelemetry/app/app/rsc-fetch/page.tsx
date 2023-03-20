// We are fetching our own API
export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await fetch('https://vercel.com')
  return <pre>{await data.text()}</pre>
}
