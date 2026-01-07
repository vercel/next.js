export async function getStaticPaths() {
  return {
    paths: [
      {
        params: { slug: [] },
      },
      {
        params: { slug: ['p1'] },
      },
      {
        params: { slug: ['p2', 'p3'] },
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
      gsp route:{' '}
      {props.params.slug === undefined
        ? 'undefined'
        : `[${props.params.slug.join('|')}]`}
    </div>
  )
}
