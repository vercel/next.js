export default function Page() {
  return <p>/overriden/[slug]</p>
}

export function getStaticProps({ params }) {
  return {
    props: {
      params,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}
