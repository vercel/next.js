import Link from 'next/link'
import Head from 'next/head'
import useI18n from '../../hooks/use-i18n'
import { languages, contentLanguageMap } from '../../lib/i18n'

const Contact = ({ lng }) => {
  const i18n = useI18n(lng)

  return (
    <div>
      <Head>
        <meta http-equiv="content-language" content={contentLanguageMap[lng]} />
      </Head>
      <h1>{i18n.t('contact.email')}</h1>
      <div>Current locale: {i18n.activeLocale}</div>
      <Link href={{ pathname: '/de/contact' }}>
        <a>Use client-side routing to change language to 'de'</a>
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

export default Contact
