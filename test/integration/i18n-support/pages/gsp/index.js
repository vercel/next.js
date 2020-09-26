import { useRouter } from 'next/router'

export default function Page(props) {
  const router = useRouter()

  return (
    <>
      <p id="props">{JSON.stringify(props)}</p>
      <p id="router-locale">{router.locale}</p>
      <p id="router-locale">{JSON.stringify(router.locales)}</p>
    </>
  )
}

export const getStaticProps = ({ locale, locales }) => {
  return {
    props: {
      locale,
      locales,
    },
  }
}
