import { SearchParamsAccess } from './search-params-access'

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  return slug === 'prerendered' ? (
    <div>Prerendered</div>
  ) : (
    <SearchParamsAccess />
  )
}

export function generateStaticParams() {
  return [{ slug: 'prerendered' }]
}
