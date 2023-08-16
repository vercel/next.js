export default function Page() {
  return <div>Page</div>
}

export function getStaticProps() {
  return {
    props: {},
  }
}

// We don't want to render in build time
export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}
