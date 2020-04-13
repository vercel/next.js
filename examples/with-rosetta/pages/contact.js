import Link from 'next/link'
import Head from 'next/head'
import useI18n from '../hooks/use-i18n'
import { contentLanguageMap } from '../lib/i18n'

const Contact = ({ lng }) => {
  const i18n = useI18n(lng)

  return (
    <div>
      <Head>
        <meta http-equiv="content-language" content={contentLanguageMap[lng]} />
      </Head>
      <h1>{i18n.t('contact.email')}</h1>
      <div>Current locale: {i18n.activeLocale}</div>
      <Link href={{ pathname: '/contact', query: { lng: 'de' } }}>
        <a>Change language SSR to 'de'</a>
      </Link>
    </div>
  )
}

export async function getServerSideProps({ query }) {
  return {
    props: {
      lng: query.lng || 'en',
    }, // will be passed to the page component as props
  }
}

export default Contact
