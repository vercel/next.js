type AppOptionalCatchAllPageProps = {
  params: Promise<{ slug?: string[] }>
}

export default async function AppOptionalCatchAllPage({
  params,
}: AppOptionalCatchAllPageProps) {
  const { slug } = await params
  const value = slug?.join('/') ?? 'root'

  return <h1>App Optional Catch-all Segment: {value}</h1>
}
