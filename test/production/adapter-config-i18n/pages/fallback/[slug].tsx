export function getStaticPaths() {
  return {
    paths: ['en', 'fr'].map((locale) => ({
      params: { slug: 'first' },
      locale,
    })),
    fallback: true,
  }
}

export function getStaticProps({ params, locale }) {
  return { props: { slug: params.slug, locale } }
}

export default function Page({ slug, locale }) {
  return (
    <p>
      {locale}: {slug}
    </p>
  )
}
