import Link from 'next/link'

export const dynamic = 'error'
export const revalidate = 3600 // arbitrarily long, just so that it doesn't happen during a test run
export const dynamicParams = true

export async function generateStaticParams() {
  return ['nodejs', 'edge'].flatMap((runtime) =>
    ['dynamic-page', 'middleware', 'route', 'server-action'].map((page) => ({
      key: `/${runtime}/${page}`,
    }))
  )
}

export default async function Page({ params }) {
  const { key } = await params
  const data = {
    key,
    timestamp: Date.now(),
  }
  console.log('/timestamp/key/[key] rendered', data)

  let path = null
  try {
    const decoded = decodeURIComponent(key)
    new URL(decoded, 'http://__n')
    path = decoded
  } catch (err) {}

  return (
    <>
      {path !== null && (
        <Link prefetch={false} href={path}>
          Go to {path}
        </Link>
      )}
      <div id="page-info">{JSON.stringify(data)}</div>
    </>
  )
}
