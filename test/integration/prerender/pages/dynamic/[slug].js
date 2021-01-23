import Link from 'next/link'

export async function getStaticProps({ params: { slug } }) {
  return {
    props: { slug },
  }
}

export async function getStaticPaths() {
  return {
    paths: [{ params: { slug: '[first]' } }, '/dynamic/[second]'],
    fallback: false,
  }
}

export default ({ slug }) => {
  // Important to not check for `slug` existence (testing that build does not
  // render fallback version and error)
  return (
    <>
      <p id="param">Hi {slug}!</p>{' '}
      <Link href="/">
        <a id="home">to home</a>
      </Link>
    </>
  )
}
