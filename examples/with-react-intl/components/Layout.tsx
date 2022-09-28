import { ReactNode } from 'react'
import { useIntl } from 'react-intl'
import Head from 'next/head'
import Nav from './Nav'

interface LayoutProps {
  title?: string
  description?: string
  children: ReactNode
}

export default function Layout({ title, description, children }: LayoutProps) {
  const intl = useIntl()

  title ||= intl.formatMessage({
    defaultMessage: 'React Intl Next.js Example',
    description: 'Default document title',
  })

  description ||= intl.formatMessage({
    defaultMessage: 'This page is powered by Next.js',
    description: 'Default document description',
  })

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description && <meta name="description" content={description} />}
      </Head>
      <header>
        <Nav />
      </header>
      {children}
    </>
  )
}
