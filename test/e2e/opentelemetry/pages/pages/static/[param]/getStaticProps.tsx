export default function Page() {
  return <div>Page</div>
}

export function getStaticProps() {
  return {
    props: {},
  }
}

// We want to make sure that we are running getStaticProps on server and thus we are creating a traces for it.
export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking',
  }
}
