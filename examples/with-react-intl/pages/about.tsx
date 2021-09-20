import { FormattedRelativeTime, useIntl } from 'react-intl'
import Layout from '../components/Layout'
import loadIntlMessages from '../helper/loadIntlMessages'
import { InferGetStaticPropsType } from 'next'

export async function getStaticProps(ctx) {
  return {
    props: {
      intlMessages: await loadIntlMessages(ctx),
    },
  }
}

type AboutPageProps = InferGetStaticPropsType<typeof getStaticProps>

export default function AboutPage(props: AboutPageProps) {
  const intl = useIntl()
  return (
    <Layout
      title={intl.formatMessage({
        defaultMessage: 'About',
        description: 'Nav: About item',
      })}
    >
      <p>
        <FormattedRelativeTime numeric="auto" value={1} unit="hour" />
      </p>
    </Layout>
  )
}
