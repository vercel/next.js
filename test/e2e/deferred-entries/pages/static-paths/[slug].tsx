type StaticPathPageProps = {
  slug: string
}

export function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'alpha' } }, { params: { slug: 'beta' } }],
    fallback: false,
  }
}

export function getStaticProps({ params }: { params: { slug: string } }) {
  return {
    props: {
      slug: params.slug,
    },
  }
}

export default function StaticPathPage({ slug }: StaticPathPageProps) {
  return <h1>Pages getStaticPaths + getStaticProps: {slug}</h1>
}
