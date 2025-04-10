type Params = {
  locale: string
  rest: string[]
}

const expectedParams: Params = {
  locale: 'en',
  rest: ['1', '2'],
}

export default async function CatchAll({
  params,
}: {
  params: Promise<Params>
}) {
  const received = await params

  return <p>{JSON.stringify(received)}</p>
}

export async function generateStaticParams(): Promise<Params[]> {
  return [expectedParams]
}
