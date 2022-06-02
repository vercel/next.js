import { FormattedMessage, FormattedNumber, useIntl } from 'react-intl'
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

type HomePageProps = InferGetStaticPropsType<typeof getStaticProps>

export default function HomePage(props: HomePageProps) {
  const intl = useIntl()
  return (
    <Layout
      title={intl.formatMessage({
        defaultMessage: 'Home',
        description: 'Index Page: document title',
      })}
      description={intl.formatMessage({
        defaultMessage: 'An example app integrating React Intl with Next.js',
        description: 'Index Page: Meta Description',
      })}
    >
      <p>
        <FormattedMessage
          defaultMessage="Hello, World!"
          description="Index Page: Content"
        />
      </p>
      <p>
        <FormattedNumber value={1000} />
      </p>
    </Layout>
  )
}
