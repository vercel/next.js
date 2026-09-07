import Images from '../../../components/images'

export default async function Page({
  params,
}: {
  params: Promise<{ variant: string }>
}) {
  const { variant } = await params
  return <Images variant={variant} />
}
