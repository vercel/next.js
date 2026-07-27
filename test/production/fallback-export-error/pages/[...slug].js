export function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export function getStaticPaths() {
  return {
    paths: ['/first'],
    fallback: 'blocking',
  }
}

export default function Page() {
  return <p>catch-all page</p>
}
