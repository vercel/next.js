import Head from 'next/head'
import useI18n from '../../hooks/use-i18n'
import { languages, contentLanguageMap } from '../../lib/i18n'

const Dashboard = () => {
  const i18n = useI18n()

  return (
    <div>
      <Head>
        <meta
          httpEquiv="content-language"
          content={contentLanguageMap[i18n.activeLocale]}
        />
      </Head>
      <h1>{i18n.t('intro.welcome', { username: 'Peter' })}</h1>
      <h3>Client side only.</h3>
      <div>Current locale: {i18n.activeLocale}</div>
      <a href="#" onClick={() => i18n.locale('de')}>
        Change language client-side to 'de'
      </a>
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

export default Dashboard
