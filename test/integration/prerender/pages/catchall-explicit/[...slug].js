import Link from 'next/link'

export async function getStaticProps({ params: { slug } }) {
  if (slug[0] === 'delayby3s') {
    await new Promise((resolve) => setTimeout(resolve, 3000))
  }

  return {
    props: {
      slug,
    },
    revalidate: 1,
  }
}

export async function getStaticPaths() {
  return {
    paths: [
      { params: { slug: ['first'] } },
      '/catchall-explicit/second',
      { params: { slug: ['another', 'value'] } },
      '/catchall-explicit/hello/another',
      '/catchall-explicit/[first]/[second]',
      { params: { slug: ['[third]', '[fourth]'] } },
    ],
    fallback: false,
  }
}

export default function Page({ slug }) {
  // Important to not check for `slug` existence (testing that build does not
  // render fallback version and error)
  return (
    <>
      <p id="catchall">Hi {slug.join(' ')}</p>{' '}
      <Link href="/" id="home">
        to home
      </Link>
    </>
  )
}
