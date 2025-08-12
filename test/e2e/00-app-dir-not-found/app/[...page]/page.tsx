import { notFound } from 'next/navigation'

interface Params {
  page: string[]
}

export async function generateStaticParams(): Promise<Params[]> {
  const data = [{ page: 'page1' }, { page: 'page2' }, { page: 'page3/demo' }]

  const params = data.map((page) => {
    const splitSlug = page.page.split('/')
    return {
      page: splitSlug,
    }
  })

  return params
}

export default async function Page({ params }) {
  if (params.page[0] !== 'demo') {
    return notFound()
  }

  return (
    <pre>
      <code>{JSON.stringify(params, null, 2)}</code>
    </pre>
  )
}
