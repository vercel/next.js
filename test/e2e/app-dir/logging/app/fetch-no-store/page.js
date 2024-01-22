export default async function Page() {
  await fetch(
    new Request(
      'https://next-data-api-endpoint.vercel.app/api/random?request-input'
    ),
    {
      cache: 'no-store',
    }
  )

  return <div>Hello World!</div>
}
