import type { GetServerSidePropsContext } from 'next'
import { FormattedRelativeTime, useIntl } from 'react-intl'
import loadIntlMessages from '../helper/loadIntlMessages'
import Layout from '../components/Layout'

export async function getStaticProps({
  locale,
  defaultLocale,
}: GetServerSidePropsContext) {
  return {
    props: {
      intlMessages: await loadIntlMessages(locale as string, defaultLocale),
    },
  }
}

export default function AboutPage() {
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
