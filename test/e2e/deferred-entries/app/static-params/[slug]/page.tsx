export function generateStaticParams() {
  return [{ slug: 'alpha' }, { slug: 'beta' }]
}

type StaticParamsPageProps = {
  params: Promise<{ slug: string }>
}

export default async function StaticParamsPage({
  params,
}: StaticParamsPageProps) {
  const { slug } = await Promise.resolve(params)
  return <h1>Generated Static Param: {slug}</h1>
}
