export default function Blog(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getStaticProps({ params: { slug } }) {
  return { props: { slug } }
}

export async function getStaticPaths() {
  const res = await fetch(process.env.TEST_SERVER_URL)
  const obj = await res.json()
  if (obj.connection === 'keep-alive') {
    return {
      paths: [{ params: { slug: 'first' } }],
      fallback: false,
    }
  }

  return {
    paths: [],
    fallback: false,
  }
}
