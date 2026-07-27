export async function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: undefined },
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
      gsp undefined route:{' '}
      {props.params.slug === undefined
        ? 'undefined'
        : `[${props.params.slug.join('|')}]`}
    </div>
  )
}
