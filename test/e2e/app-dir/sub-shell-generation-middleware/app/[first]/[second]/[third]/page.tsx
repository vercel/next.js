export default async function NotRewritePage({
  params,
}: {
  params: Promise<{ first: string; second: string; third: string }>
}) {
  const { first, second, third } = await params
  return (
    <div data-slug={`${first}/${second}/${third}`}>
      Page /{first}/{second}/{third}
    </div>
  )
}

export async function generateStaticParams() {
  return [{ first: 'first', second: 'second', third: 'third' }]
}
