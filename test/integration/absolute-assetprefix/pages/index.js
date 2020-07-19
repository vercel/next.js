import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about">
        <a id="about-link">getStaticProps</a>
      </Link>
      <br />
      <Link href="/gsp-fallback/[slug]" as="/gsp-fallback/prerendered">
        <a id="gsp-prerender-link">getStaticPaths prerendered</a>
      </Link>
      <br />
      <Link href="/gsp-fallback/[slug]" as="/gsp-fallback/fallback">
        <a id="gsp-fallback-link">getStaticPaths fallback</a>
      </Link>
      <br />
      <Link href="/gssp?prop=foo">
        <a id="gssp-link">getServerSideProps</a>
      </Link>
    </>
  )
}
