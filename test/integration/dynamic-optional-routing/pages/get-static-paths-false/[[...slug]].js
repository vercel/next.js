export async function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: false },
      },
    ],
    fallback: false,
  }
}

export async function getStaticProps({ params }) {
  return { props: { params } }
}

export default function Index(props) {
  return (
    <div id="route">
      gsp false route:{' '}
      {props.params.slug === undefined
        ? 'undefined'
        : `[${props.params.slug.join('|')}]`}
    </div>
  )
}
