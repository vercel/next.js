export function getStaticPaths() {
  return { paths: ['/gone/a', '/gone/missing'], fallback: 'blocking' }
}

export function getStaticProps({ params }: { params: { slug: string } }) {
  if (params.slug === 'missing') {
    return { notFound: true }
  }
  return { props: { slug: params.slug } }
}

export default function Page({ slug }: { slug: string }) {
  return <p>pages gone page {slug}</p>
}
