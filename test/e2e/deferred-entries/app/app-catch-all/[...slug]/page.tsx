type AppCatchAllPageProps = {
  params: Promise<{ slug: string[] }>
}

export default async function AppCatchAllPage({
  params,
}: AppCatchAllPageProps) {
  const { slug } = await params

  return <h1>App Catch-all Segment: {slug.join('/')}</h1>
}
