export default function Home(props) {
  return <pre id="props">{JSON.stringify(props)}</pre>
}

export async function getStaticPaths() {
  return {
    paths: [
      { params: { slug: false } },
      { params: { slug: ['a'] } },
      { params: { slug: ['hello', 'world'] } },
    ],
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  return {
    props: {
      params,
      random: Math.random(),
    },
    revalidate: 1,
  }
}
