import { defineMessages, useIntl } from 'react-intl'
import Head from 'next/head'
import Nav from './Nav'

const messages = defineMessages({
  title: {
    id: 'title',
    defaultMessage: 'React Intl Next.js Example'
  }
})

export default ({ title, children }) => {
  const intl = useIntl()

  return (
    <div>
      <Head>
        <meta name='viewport' content='width=device-width, initial-scale=1' />
        <title>{title || intl.formatMessage(messages.title)}</title>
      </Head>

      <header>
        <Nav />
      </header>

      {children}
    </div>
  )
}
