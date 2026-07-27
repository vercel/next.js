export function getStaticProps({ params }) {
  return { props: { message: `hello ${params.slug}` } }
}

export function getStaticPaths() {
  return { paths: ['/ssg/dynamic/one'], fallback: true }
}

export default ({ message }) => <p id="content">{message || 'loading'}</p>
