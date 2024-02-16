// We want to trace this fetch in runtime
export const dynamic = 'force-dynamic'

export const runtime = 'edge'

export async function generateMetadata() {
  return {}
}

export default async function Page() {
  const data = await fetch('https://vercel.com')
  return <pre>RESONSE: {data.status}</pre>
}
