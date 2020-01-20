export async function unstable_getStaticProps({ params: { slug } }) {
  return {
    props: {
      slug,
    },
    revalidate: 1,
  }
}

export async function unstable_getStaticPaths() {
  return [
    { params: { slug: ['first'] } },
    '/catchall/second',
    { params: { slug: ['another', 'value'] } },
    '/catchall/hello/another',
  ]
}

export default ({ slug }) => <p id="catchall">Hi {slug.join('/')}</p>
