import { Suspense } from 'react'
export default function Page({ params }: PageProps<'/api-closed/[lang]'>) {
  return (
    <Suspense fallback={<p>Loading language</p>}>
      <Language params={params} />
    </Suspense>
  )
}
async function Language({
  params,
}: Pick<PageProps<'/api-closed/[lang]'>, 'params'>) {
  return <p>Open page language: {(await params).lang}</p>
}
