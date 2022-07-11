import { useRouter } from 'next/dist/client/components/hooks-client'

export default function Page({ params, query }) {
  return (
    <h1 id="params-and-query" data-params={params.slug} data-query={query.slug}>
      hello from /param-and-query/{params.slug}?slug={query.slug}
    </h1>
  )
}
