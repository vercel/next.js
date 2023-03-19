import Link from 'next/link'

export default function Page() {
  return (
    <>
      <Link href="/about" id="about-link">
        getStaticProps
      </Link>
      <br />
      <Link
        href="/gsp-fallback/[slug]"
        as="/gsp-fallback/prerendered"
        id="gsp-prerender-link"
      >
        getStaticPaths prerendered
      </Link>
      <br />
      <Link
        href="/gsp-fallback/[slug]"
        as="/gsp-fallback/fallback"
        id="gsp-fallback-link"
      >
        getStaticPaths fallback
      </Link>
      <br />
      <Link href="/gssp?prop=foo" id="gssp-link">
        getServerSideProps
      </Link>
    </>
  )
}
