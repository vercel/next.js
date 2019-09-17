import {
  FormattedMessage,
  FormattedNumber,
  defineMessages,
  useIntl
} from 'react-intl'
import Head from 'next/head'
import Layout from '../components/Layout'

const { description } = defineMessages({
  description: {
    id: 'description',
    defaultMessage: 'An example app integrating React Intl with Next.js'
  }
})

export default () => {
  const intl = useIntl()

  return (
    <Layout>
      <Head>
        <meta name='description' content={intl.formatMessage(description)} />
      </Head>
      <p>
        <FormattedMessage id='greeting' defaultMessage='Hello, World!' />
      </p>
      <p>
        <FormattedNumber value={1000} />
      </p>
    </Layout>
  )
}
