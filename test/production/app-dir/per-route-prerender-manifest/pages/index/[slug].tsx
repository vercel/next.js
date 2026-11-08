export function getStaticPaths() {
  return { paths: ['/index/a'], fallback: 'blocking' }
}

export function getStaticProps({ params }: { params: { slug: string } }) {
  return { props: { slug: params.slug } }
}

export default function Page({ slug }: { slug?: string }) {
  return <p>pages index slug page {slug}</p>
}
