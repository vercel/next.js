export default function Home(props) {
  return (
    <>
      <p>preview notFound page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = async ({
  locale,
  defaultLocale,
  preview = false,
}) => {
  const isNotFound = locale !== defaultLocale
  console.log('revalidating /preview-only-not-found', {
    locale,
    defaultLocale,
    isNotFound,
    preview,
  })
  return {
    props: { random: Math.random(), preview },
    notFound: isNotFound && !preview,
  }
}
