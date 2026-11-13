import Images, { type LoadingMode } from '../images'

export default async function Page({
  params,
}: {
  params: Promise<{ loading: LoadingMode }>
}) {
  const { loading } = await params
  return <Images loading={loading} />
}
