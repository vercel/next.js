type PagesDynamicRouteProps = {
  slug: string
}

export function getServerSideProps({ params }: { params: { slug: string } }) {
  return {
    props: {
      slug: params.slug,
    },
  }
}

export default function PagesDynamicRoute({ slug }: PagesDynamicRouteProps) {
  return <h1>Pages Dynamic Route: {slug}</h1>
}
