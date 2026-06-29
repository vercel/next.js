type PagesOptionalCatchAllRouteProps = {
  slug?: string[]
}

export function getServerSideProps({
  params,
}: {
  params?: { slug?: string[] }
}) {
  return {
    props: {
      slug: params?.slug ?? null,
    },
  }
}

export default function PagesOptionalCatchAllRoute({
  slug,
}: PagesOptionalCatchAllRouteProps) {
  const value = slug?.join('/') ?? 'root'

  return <h1>Pages Optional Catch-all Route: {value}</h1>
}
