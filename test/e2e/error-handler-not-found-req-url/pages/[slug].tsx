export default function Page() {
  return <p>hello world</p>
}

export async function getStaticProps() {
  return {
    notFound: true,
  }
}

export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}
