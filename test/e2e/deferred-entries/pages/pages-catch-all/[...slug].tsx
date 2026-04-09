type PagesCatchAllRouteProps = {
  slug: string[]
}

export function getServerSideProps({ params }: { params: { slug: string[] } }) {
  return {
    props: {
      slug: params.slug,
    },
  }
}

export default function PagesCatchAllRoute({ slug }: PagesCatchAllRouteProps) {
  return <h1>Pages Catch-all Route: {slug.join('/')}</h1>
}
