import { Suspense } from 'react'

type Props = { params: Promise<{ one: string; two: string }> }

async function Params({ params }: Props) {
  const { one, two } = await params
  return (
    <p id="params">
      {one}/{two}
    </p>
  )
}

export default function Page(props: Props) {
  return (
    <Suspense fallback={null}>
      <Params {...props} />
    </Suspense>
  )
}
