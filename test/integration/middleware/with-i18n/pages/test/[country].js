export const getStaticPaths = async () => {
  return {
    fallback: 'blocking',
    paths: [],
  }
}

export const getStaticProps = async ({ params: { country }, locale }) => {
  return {
    props: { country, locale },
    revalidate: false,
  }
}

export default function CountryPage({ locale, country }) {
  return (
    <ul>
      <li id="country">{country}</li>
      <li id="locale">{locale}</li>
    </ul>
  )
}
