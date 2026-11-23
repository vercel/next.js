import { Suspense } from 'react'
import { getValue } from '../../../value'

type Props = { params: Promise<{ slug: string }> }

export function generateStaticParams() {
  return [{ slug: 'built' }]
}

async function Content({ params }: Props) {
  const { slug } = await params
  return <p id="value">{await getValue('suspended', slug)}</p>
}

export default function Page(props: Props) {
  return (
    <Suspense fallback="Loading suspended content...">
      <Content {...props} />
    </Suspense>
  )
}
