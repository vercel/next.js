export const fetchCache = 'default-cache'

export default async function Page() {
  await fetch(
    new Request(
      'https://next-data-api-endpoint.vercel.app/api/random?request-input'
    ),
    {
      next: {
        revalidate: 3,
      },
    }
  )

  await fetch(
    new Request(
      'https://next-data-api-endpoint.vercel.app/api/random?request-input-cache-override',
      {
        cache: 'force-cache',
      }
    ),
    {
      next: {
        revalidate: 3,
      },
    }
  )

  await fetch(
    'https://next-data-api-endpoint.vercel.app/api/random?request-string',
    {
      next: {
        revalidate: 3,
      },
      cache: 'force-cache',
    }
  )

  return <div>Hello World!</div>
}
