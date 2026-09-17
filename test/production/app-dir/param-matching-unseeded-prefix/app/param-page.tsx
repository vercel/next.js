import { Suspense } from 'react'

type Props = { params: Promise<{ top: string; bottom: string }> }

async function Params({ params }: Props) {
  const { top, bottom } = await params
  return <p>{`${top}/${bottom}`}</p>
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<p>Waiting for top and bottom</p>}>
      <Params params={params} />
    </Suspense>
  )
}
