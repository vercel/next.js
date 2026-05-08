import { OfflineStatus } from '../../offline-status'
import { HashIndicator } from './hash-indicator'

type PageProps = {
  params: Promise<{ value: string }>
  searchParams: Promise<{
    tag?: string | string[]
    token?: string
  }>
}

export const unstable_instant = false

export default async function UrlStressPage({
  params,
  searchParams,
}: PageProps) {
  const { value } = await params
  const query = await searchParams
  const tags =
    query.tag === undefined
      ? []
      : Array.isArray(query.tag)
        ? query.tag
        : [query.tag]

  return (
    <>
      <p id="url-stress-page">url stress path: {value}</p>
      <p id="url-stress-token">url stress token: {query.token ?? 'missing'}</p>
      <p id="url-stress-tags">url stress tags: {tags.join(',')}</p>
      <HashIndicator />
      <OfflineStatus />
    </>
  )
}
