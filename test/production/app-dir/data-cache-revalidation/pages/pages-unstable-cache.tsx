import { unstable_cache } from 'next/cache'

const getValue = unstable_cache(
  async () => {
    const response = await fetch(
      'https://next-data-api-endpoint.vercel.app/api/random?data-cache-revalidation=pages-unstable-cache'
    )
    return response.text()
  },
  ['data-cache-revalidation:pages-unstable-cache'],
  { revalidate: 3600 }
)

export async function getStaticProps() {
  return { props: { value: await getValue() }, revalidate: 60 }
}

export default function Page({ value }: { value: string }) {
  return <p id="value">{value}</p>
}
