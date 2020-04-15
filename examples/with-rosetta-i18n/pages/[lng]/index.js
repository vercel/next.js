import Link from 'next/link'
import Head from 'next/head'
import useI18n from '../../hooks/use-i18n'
import { languages, contentLanguageMap } from '../../lib/i18n'

const HomePage = ({ lng }) => {
  const i18n = useI18n(lng)

  return (
    <div>
      <Head>
        <meta
          http-equiv="content-language"
          content={contentLanguageMap[i18n.activeLocale]}
        />
      </Head>
      <h1>{i18n.t('intro.welcome', { username: 'Peter' })}</h1>
      <h3>{i18n.t('intro.text')}</h3>
      <div>Current locale: {i18n.activeLocale}</div>
      <Link href="/de">
        <a>Change language SSG to 'de'</a>
      </Link>
    </div>
  )
}

export async function getStaticProps({ params }) {
  return {
    props: { lng: params.lng },
  }
}

export async function getStaticPaths() {
  return {
    paths: languages.map(l => ({ params: { lng: l } })),
    fallback: true,
  }
}

export default HomePage
