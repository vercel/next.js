import { getSentinelValue } from './sentinel'

export async function LastModified({ params }) {
  const { slug } = await params

  return (
    <p id="last-modified">
      Page /{slug} last modified: {new Date().toISOString()} (
      {getSentinelValue()})
    </p>
  )
}

export async function CachedLastModified({ params }) {
  'use cache'

  return <LastModified params={params} />
}
