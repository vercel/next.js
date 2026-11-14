import { Suspense } from 'react'
import { SsrError } from './ssr-error'

export function generateStaticParams() {
  return [{ slug: 'ok' }]
}

async function Content({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (slug === 'rsc') {
    throw new Error('original-rsc-error')
  }
  if (slug === 'ssr') {
    return <SsrError />
  }
  return <p>Healthy content</p>
}

export default function Page(props: { params: Promise<{ slug: string }> }) {
  return (
    <>
      <p>Static shell</p>
      <Suspense fallback={<p>Loading</p>}>
        <Content params={props.params} />
      </Suspense>
    </>
  )
}
