import { lang, locale } from 'next/root-params'
import { Suspense } from 'react'

export default async function Page({ params }) {
  return (
    <div>
      <p>
        root params shouldn't need a suspense a suspense boundary
        <span id="root-params">
          {JSON.stringify({
            lang: await lang(),
            locale: await locale(),
          })}
        </span>
      </p>
      <p>
        in <code>cacheComponents</code>, dynamic params need a suspense boundary
        (because we didn't provide a value in <code>generateStaticParams</code>)
        <Suspense>
          <DynamicSlug params={params} />
        </Suspense>
      </p>
    </div>
  )
}

async function DynamicSlug({ params }) {
  const { slug } = await params
  return <span id="dynamic-params">{slug}</span>
}
