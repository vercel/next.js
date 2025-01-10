export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?sam=iam',
    {
      cache: 'force-cache',
      next: { tags: ['thankyounext', 'justputit'] },
    }
  ).then((res) => res.text())

  return <p id="page-data">data: {data}</p>
}
