import { ReactNode, Suspense } from 'react'
import { CachedData } from '../../data-fetching'

const CACHE_KEY = __dirname + '/__LAYOUT__'

// Only lang has a generator. The child page leaves id as a fallback param.
export function generateStaticParams() {
  return [{ lang: 'en' }]
}

export default function PartialLangLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ lang: string }>
}) {
  return (
    <>
      <Suspense fallback={<p>Waiting for lang...</p>}>
        <LangLabel params={params} />
      </Suspense>
      {children}
    </>
  )
}

async function LangLabel({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  console.log('after params - lang')
  return (
    <>
      <p>lang: {lang}</p>
      <CachedData label="layout" cacheKey={`${CACHE_KEY}-${lang}`} />
    </>
  )
}
