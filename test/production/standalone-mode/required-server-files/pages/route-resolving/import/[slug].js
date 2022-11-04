export default function Page(props) {
  return <p>/import/[slug]</p>
}

export function getStaticProps() {
  return {
    redirect: {
      destination: '/somewhere',
      permanent: false,
    },
  }
}

export function getStaticPaths() {
  return {
    paths: [],
    fallback: true,
  }
}
