import { Host } from './host'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  return <Host show={(await searchParams).show === '1'} />
}
