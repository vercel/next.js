import Images from '../../../components/images'
import { Suspense } from 'react'

async function VariantImages({
  params,
}: {
  params: Promise<{ variant: string }>
}) {
  const { variant } = await params
  return <Images variant={variant} />
}

export default function Page({
  params,
}: {
  params: Promise<{ variant: string }>
}) {
  return (
    <Suspense fallback={null}>
      <VariantImages params={params} />
    </Suspense>
  )
}
