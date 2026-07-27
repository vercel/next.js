export async function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: null },
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
      gsp null route:{' '}
      {props.params.slug === undefined
        ? 'undefined'
        : `[${props.params.slug.join('|')}]`}
    </div>
  )
}
