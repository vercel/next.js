import { Suspense } from 'react'

type Props = { params: Promise<{ lang: string; bottom: string }> }

async function Params({ params }: Props) {
  const { lang, bottom } = await params
  return <p>{`${lang}/${bottom}`}</p>
}

export default function Page({ params }: Props) {
  return (
    <Suspense fallback={<p>Waiting for lang and bottom</p>}>
      <Params params={params} />
    </Suspense>
  )
}
