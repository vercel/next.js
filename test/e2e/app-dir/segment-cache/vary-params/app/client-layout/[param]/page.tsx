type Params = { param: string }

export async function generateStaticParams(): Promise<Params[]> {
  return [{ param: 'aaa' }, { param: 'bbb' }]
}

export default async function Page({ params }: { params: Promise<Params> }) {
  const { param } = await params
  return (
    <div id="client-layout-param-page">
      <div data-param={param}>Param value: {param}</div>
    </div>
  )
}
