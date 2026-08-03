import { getPromiseContext } from '../promise-context'

export const revalidate = 3600

export function generateStaticParams() {
  return [{ slug: 'test' }]
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const controlContext = getPromiseContext(Promise.resolve())
  const paramsContext = getPromiseContext(params)
  const searchParamsContext = getPromiseContext(searchParams)
  const { slug } = await params

  return (
    <main>
      <h1>{slug}</h1>
      <p id="control-captures-work-store">{String(controlContext.workStore)}</p>
      <p id="control-captures-work-unit-store">
        {String(controlContext.workUnitStore)}
      </p>
      <p id="params-captures-work-store">{String(paramsContext.workStore)}</p>
      <p id="params-captures-work-unit-store">
        {String(paramsContext.workUnitStore)}
      </p>
      <p id="search-params-captures-work-store">
        {String(searchParamsContext.workStore)}
      </p>
      <p id="search-params-captures-work-unit-store">
        {String(searchParamsContext.workUnitStore)}
      </p>
    </main>
  )
}
