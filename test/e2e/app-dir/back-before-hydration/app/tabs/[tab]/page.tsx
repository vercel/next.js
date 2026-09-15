import { SelectDefaultTab } from './select-default-tab'

export function generateStaticParams() {
  return [{ tab: 'none' }, { tab: 'first' }]
}

export default async function Tab({
  params,
}: {
  params: Promise<{ tab: string }>
}) {
  const { tab } = await params
  return (
    <>
      <h1 id={`tab-${tab}`}>Tab {tab}</h1>
      {tab === 'none' ? <SelectDefaultTab /> : null}
    </>
  )
}
