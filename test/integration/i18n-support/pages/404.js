export default function NotFound(props) {
  return (
    <>
      <h1 id="not-found">This page could not be found | 404</h1>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = ({ locale, locales, defaultLocale }) => {
  return {
    props: {
      locale,
      locales,
      defaultLocale,
      is404: true,
    },
  }
}
