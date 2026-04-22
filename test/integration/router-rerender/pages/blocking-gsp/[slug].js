export default function BlockingGetStaticPropsRewritePage({ slug }) {
  return <p id="slug">{slug}</p>
}

export function getStaticProps({ params }) {
  return {
    props: {
      slug: params.slug,
    },
    revalidate: 1,
  }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}
