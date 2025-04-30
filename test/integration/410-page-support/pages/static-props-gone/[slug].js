export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'test' } }],
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  if (params.slug === 'deleted') {
    return {
      gone: true,
    }
  }

  return {
    props: {
      slug: params.slug,
    },
  }
}

export default function StaticPropsPage({ slug }) {
  return <h1>Slug: {slug}</h1>
}
