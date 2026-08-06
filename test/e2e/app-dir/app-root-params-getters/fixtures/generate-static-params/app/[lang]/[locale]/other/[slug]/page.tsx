import { lang, locale } from 'next/root-params'
import { Suspense } from 'react'

export async function generateStaticParams() {
  const l = await lang()
  return [{ slug: `${l}-post` }]
}

export default async function Page({ params }) {
  return (
    <main>
      <p id="root-params">
        {JSON.stringify({ lang: await lang(), locale: await locale() })}
      </p>
      <Suspense fallback="...">
        <DynamicParams params={params} />
      </Suspense>
    </main>
  )
}

async function DynamicParams({
  params,
}: {
  params: Promise<{ [key: string]: string }>
}) {
  const { slug } = await params
  return <p id="dynamic-params">{slug}</p>
}
