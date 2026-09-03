export default function Page({ slug }) {
  return <p>slug: {slug}</p>
}

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}

export async function getStaticProps({ params }) {
  return {
    props: { slug: params.slug },
    revalidate: 10,
  }
}
