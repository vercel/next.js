// We want to trace this fetch in runtime with cache attributes
export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  return {}
}

export default async function Page() {
  // This should generate cache attributes since we're using revalidate
  const data = await fetch('https://example.vercel.sh', {
    next: { revalidate: 60 },
  })
  return (
    <>
      <p>Cached Page</p>
      <pre>{await data.text()}</pre>
    </>
  )
}
