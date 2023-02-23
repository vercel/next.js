export default function Page() {
  return <p>/overridden/[slug]</p>
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
