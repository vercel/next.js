import { FilterLinks } from './filter-links'

type SearchParams = { [key: string]: string | string[] | undefined }

function parseSelected(raw: string | string[] | undefined): string[] {
  if (raw === undefined) return []
  return Array.isArray(raw) ? raw : [raw]
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const selected = parseSelected(params.f)

  return (
    <main>
      <FilterLinks selected={selected} />
      <p id="server-count">server count: {selected.length}</p>
      <p id="server-values">server values: {JSON.stringify(selected)}</p>
    </main>
  )
}
