import { Host } from './host'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ target?: string }>
}) {
  return <Host target={(await searchParams).target} />
}
