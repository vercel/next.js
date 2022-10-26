import Link from 'next/link'
import { useRouter } from 'next/router'
import LocaleSwitcher from '../components/locale-switcher'

export default function GsspPage(props) {
  const router = useRouter()
  const { defaultLocale } = router

  return (
    <div>
      <h1>getServerSideProps page</h1>
      <p>Current locale: {props.locale}</p>
      <p>Default locale: {defaultLocale}</p>
      <p>Configured locales: {JSON.stringify(props.locales)}</p>

      <LocaleSwitcher />

      <Link href="/gsp">To getStaticProps page</Link>
      <br />

      <Link href="/gsp/first">To dynamic getStaticProps page</Link>
      <br />

      <Link href="/">To index page</Link>
      <br />
    </div>
  )
}

export const getServerSideProps = ({ locale, locales }) => {
  return {
    props: {
      locale,
      locales,
    },
  }
}
