import { useRouter } from 'next/dist/client/components/hooks-client'

export default function Page() {
  const router = useRouter()

  return (
    <h1
      id="params-and-query"
      data-params={router.params.slug}
      data-query={router.query.slug}
    >
      hello from /param-and-query/{router.params.slug}?slug={router.query.slug}
    </h1>
  )
}
