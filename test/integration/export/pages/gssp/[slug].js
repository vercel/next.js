export async function getStaticPaths() {
  return {
    paths: ['/gssp/foo/'],
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  return { props: params }
}

export default function Page({ slug }) {
  return `Hello ${slug}`
}
