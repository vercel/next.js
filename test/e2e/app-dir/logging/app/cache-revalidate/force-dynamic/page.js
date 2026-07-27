export const dynamic = 'force-dynamic'

export default async function Page() {
  const data = await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?revalidate-3',
    {
      next: {
        revalidate: 3,
      },
    }
  ).then((res) => res.text())

  return <div>Hello World! {data}</div>
}
