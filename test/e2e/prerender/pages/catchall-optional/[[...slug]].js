import Link from 'next/link'

export async function getStaticProps({ params: { slug } }) {
  return {
    props: {
      slug: slug || [],
    },
  }
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: [] } }, { params: { slug: ['value'] } }],
    fallback: false,
  }
}

export default ({ slug }) => {
  // Important to not check for `slug` existence (testing that build does not
  // render fallback version and error)
  return (
    <>
      <p id="catchall">Catch all: [{slug.join(', ')}]</p>
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
