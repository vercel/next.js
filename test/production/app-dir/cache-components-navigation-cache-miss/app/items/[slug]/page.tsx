import { Suspense } from 'react'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return [{ slug: 'static' }]
}

async function Content({ params }: Props) {
  const { slug } = await params
  return <p id="slug">{slug}</p>
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={<p id="loading">Loading...</p>}>
      <Content {...props} />
    </Suspense>
  )
}
