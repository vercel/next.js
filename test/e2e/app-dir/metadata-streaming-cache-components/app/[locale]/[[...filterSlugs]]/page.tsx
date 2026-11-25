import { Suspense } from 'react'
import { ActionForm } from './action-form'

type Params = {
  locale: string
  filterSlugs?: string[]
}

export function generateStaticParams(): Array<Pick<Params, 'locale'>> {
  return [{ locale: 'en' }]
}

async function ParamsValue({ params }: { params: Promise<Params> }) {
  const { locale, filterSlugs } = await params
  const mappedSlugs = filterSlugs?.map((slug) => slug.toUpperCase()) ?? []

  return (
    <p id="params">
      {JSON.stringify({
        locale,
        filterSlugs: filterSlugs ?? null,
        mappedSlugs,
      })}
    </p>
  )
}

export default function Page({ params }: { params: Promise<Params> }) {
  return (
    <>
      <Suspense fallback={<p>Loading params</p>}>
        <ParamsValue params={params} />
      </Suspense>
      <ActionForm />
    </>
  )
}
