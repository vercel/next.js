export const getServerSideProps = async ({ locale }) => {
  return {
    props: {
      locale,
    },
  }
}

export default function Dynamic({ locale }) {
  return <div id="dynamic-locale">Locale: {locale}</div>
}
