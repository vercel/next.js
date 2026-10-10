export async function getStaticProps() {
  const data = '404'
  return {
    props: { data },
    notFound: data.trim() === '404',
    revalidate: 1,
  }
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: 'first' } }],
    fallback: 'blocking',
  }
}

export default function Page({ data }) {
  return <p id="data">{data}</p>
}
