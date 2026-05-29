interface Params {
  slug: string
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const paramsValue = await params
  return <p>slug:{paramsValue.slug}</p>
}
