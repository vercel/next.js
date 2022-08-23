import Head from 'next/head'
import useTranslation from 'next-translate/useTranslation'
import Layout from '../components/layout'

export default function Index({ preview }) {
  const { t } = useTranslation()
  const website_title = `${t('common:modern_websites')} · ${t('common:home')}`
  return (
    <Layout preview={preview}>
      <Head>
        <title>{website_title}</title>
        <meta name="description" content="Era só um teste social" />
      </Head>
      <section>
        <div>
          <h1>{t('home:hello')}</h1>
        </div>
      </section>
    </Layout>
  )
}
