import { Suspense } from 'react'

async function Content(props: { params: Promise<{ params: Array<string> }> }) {
  const { params: catchAllParams } = await props.params
  return (
    <div id="page" className={`page_${catchAllParams.join('_')}`}>
      {catchAllParams.join('/')}
    </div>
  )
}

export default function Page(props: {
  params: Promise<{ params: Array<string> }>
}) {
  return (
    <Suspense>
      <Content params={props.params} />
    </Suspense>
  )
}
