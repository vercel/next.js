type AppDynamicPageProps = {
  params: Promise<{ slug: string }>
}

export default async function AppDynamicPage({ params }: AppDynamicPageProps) {
  const { slug } = await params

  return <h1>App Dynamic Segment: {slug}</h1>
}
