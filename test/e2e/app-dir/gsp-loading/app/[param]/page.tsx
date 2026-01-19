import { Client } from './client'

export function generateStaticParams() {
  return [{ param: 'one' }]
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ param: string }>
  searchParams: Promise<Record<string, undefined | string | string[]>>
}) {
  const { param } = await params
  return (
    <div>
      param: {param}
      <Client searchParams={searchParams} />
    </div>
  )
}
