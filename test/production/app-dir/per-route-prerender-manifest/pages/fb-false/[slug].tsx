export function getStaticPaths() {
  return { paths: ['/fb-false/a'], fallback: false }
}

export function getStaticProps({ params }: { params: { slug: string } }) {
  return { props: { slug: params.slug } }
}

export default function Page({ slug }: { slug?: string }) {
  return <p>pages fb-false page {slug}</p>
}
