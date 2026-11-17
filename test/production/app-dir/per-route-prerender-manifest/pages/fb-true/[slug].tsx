export function getStaticPaths() {
  return { paths: ['/fb-true/a'], fallback: true }
}

export function getStaticProps({ params }: { params: { slug: string } }) {
  return { props: { slug: params.slug } }
}

export default function Page({ slug }: { slug?: string }) {
  return <p>pages fb-true page {slug}</p>
}
