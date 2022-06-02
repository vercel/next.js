export function getStaticProps({ params }) {
  return { props: { message: `hello ${params.slug.join(' ')}` } }
}

export function getStaticPaths() {
  return {
    paths: ['/ssg/catch-all/one', '/ssg/catch-all/one/two'],
    fallback: true,
  }
}

export default ({ message }) => <p id="content">{message || 'loading'}</p>
