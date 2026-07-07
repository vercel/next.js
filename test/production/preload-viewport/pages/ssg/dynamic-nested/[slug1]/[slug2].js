export function getStaticProps({ params }) {
  return { props: { message: `hello ${params.slug1} ${params.slug2}` } }
}

export function getStaticPaths() {
  return {
    paths: ['/ssg/dynamic-nested/one/two'],
    fallback: true,
  }
}

export default ({ message }) => <p id="content">{message || 'loading'}</p>
